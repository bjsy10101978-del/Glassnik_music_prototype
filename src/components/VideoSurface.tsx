/**
 * VideoSurface — the real video player for uploaded clips.
 *
 * Exactly one <video> element is reused for the whole app (React keeps the
 * same DOM node by identity), so moving between clips changes `src` instead of
 * creating new players. The video is muted by design: the music engine owns
 * the audio output.
 *
 * Playback pipeline:
 *  - always tries native playback first via object URL (MP4/WebM/MOV work
 *    directly and can seek/loop)
 *  - if the browser reports a media error, falls back to hls.js with
 *    `enableWorker: false`; HLS.js repackages the file into fragments in
 *    memory and can play codecs the browser cannot decode natively
 *  - if both fail, a clear error state is shown
 *
 * HLS.js is imported dynamically so it is only downloaded when actually used.
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import type { Clip } from '../player/clips';

export type VideoStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * How long the browser gets to show the first frame of a clip.
 *
 * A file that is not a real video can leave the media element loading
 * forever, so the player gives up after this time and shows an error.
 */
const LOAD_TIMEOUT_MS = 5000;

interface HlsLike {
  attachMedia(media: HTMLMediaElement): void;
  on(event: string, handler: (event: unknown, data: unknown) => void): void;
  destroy(): void;
}

export function VideoSurface({
  clip,
  onStatusChange,
}: {
  clip: Clip | null;
  onStatusChange?: (status: VideoStatus, message: string | null) => void;
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsLike | null>(null);
  const [useNative, setUseNative] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<VideoStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const report = (next: VideoStatus, message: string | null) => {
    setStatus(next);
    setError(message);
    onStatusChange?.(next, message);
  };

  // Reset the pipeline whenever the clip changes or a retry is requested.
  useEffect(() => {
    setUseNative(true);
    report(clip ? 'loading' : 'idle', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id, attempt]);

  // Attach the media source: native object URL first, hls.js as fallback.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    const cleanupHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const tryHlsFallback = async () => {
      if (cancelled) return;
      try {
        const module = await import('hls.js');
        const Hls = module.default;
        if (cancelled || !videoRef.current) return;
        if (!Hls.isSupported()) {
          report('error', 'This video could not be decoded by the browser.');
          return;
        }
        cleanupHls();
        objectUrl = URL.createObjectURL(clip.file);
        const hls = new Hls({
          // In-memory repackaging of the local file; no network, no workers.
          enableWorker: false,
        }) as unknown as HlsLike;
        hlsRef.current = hls;
        hls.on('hlsError', (_event, data) => {
          const details = (data as { details?: string } | null)?.details ?? 'unknown error';
          report('error', `Video could not be played (${details}).`);
        });
        hls.on('hlsManifestParsed', () => {
          report('ready', null);
        });
        hls.attachMedia(videoRef.current);
      } catch {
        report('error', 'This video could not be decoded by the browser.');
      }
    };

    const handleError = () => {
      if (cancelled) return;
      clearTimeout(loadTimeout);
      if (useNative) {
        // Native decode failed: retry through hls.js.
        cleanupHls();
        setUseNative(false);
      } else {
        report('error', 'This video format is not supported in this browser.');
      }
    };

    const handleLoaded = () => {
      if (cancelled) return;
      clearTimeout(loadTimeout);
      report('ready', null);
    };

    // A file that the browser cannot make sense of sometimes leaves the
    // element loading forever. Give up after a while so the user sees a
    // clear message instead of an endless spinner.
    const loadTimeout = setTimeout(() => {
      if (cancelled) return;
      if (video.readyState === 0) {
        report('error', 'This clip could not be loaded. It may not be a video file.');
      }
    }, LOAD_TIMEOUT_MS);

    video.addEventListener('error', handleError);
    video.addEventListener('loadeddata', handleLoaded);

    if (useNative) {
      objectUrl = URL.createObjectURL(clip.file);
      video.src = objectUrl;
      video.load();
    } else {
      void tryHlsFallback();
    }

    return () => {
      cancelled = true;
      clearTimeout(loadTimeout);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadeddata', handleLoaded);
      cleanupHls();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [clip, useNative]);

  // Detach any source on unmount so nothing keeps decoding in the background.
  useEffect(
    () => () => {
      const video = videoRef.current;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    },
    [],
  );

  return (
    <div className="video-surface">
      {clip ? (
        <>
          <video
            ref={videoRef}
            className="video-element"
            controls
            playsInline
            muted
            preload="metadata"
            aria-label={`Uploaded clip preview: ${clip.name}`}
          />
          <div className="video-status-row">
            <span className={`video-status video-status-${status}`} role="status">
              {status === 'loading' && 'Loading clip…'}
              {status === 'ready' && 'Clip ready (muted — music plays from the player below)'}
              {status === 'error' && (error ?? 'Video error')}
              {status === 'idle' && 'No clip selected'}
            </span>
            {status === 'error' && (
              <button type="button" className="btn btn-small" onClick={() => setAttempt((a) => a + 1)}>
                Retry
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="video-placeholder">
          <span className="video-placeholder-icon" aria-hidden="true">
            ▶
          </span>
          <p>Upload a clip in the panel to preview it here.</p>
        </div>
      )}
    </div>
  );
}
