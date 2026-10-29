import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type JSX } from 'react';
import { taxonomyData } from '../data/dataset';
import { useMusic } from '../player/MusicProvider';
import { formatDuration } from '../player/clips';
import { VideoSurface, type VideoStatus } from './VideoSurface';

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv|mkv|avi)$/i.test(file.name);
}

export function VideoPanel(): JSX.Element {
  const {
    clips,
    activeClip,
    activeClipIndex,
    addClips,
    removeClip,
    clearClips,
    goToClip,
    tripContext,
    updateTripContext,
    context,
    sourceMode,
    musicEnabled,
  } = useMusic();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [durations, setDurations] = useState<Record<string, number | null>>({});
  const [videoStatus, setVideoStatus] = useState<VideoStatus>('idle');

  const acceptedCount = clips.length;

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const all = Array.from(fileList);
    const videos = all.filter(isVideoFile);
    const other = all.filter((f) => !isVideoFile(f));
    setRejected(other.map((f) => f.name));
    if (videos.length > 0) addClips(videos);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFiles(event.dataTransfer?.files ?? null);
  };

  const openPicker = () => inputRef.current?.click();

  const contextSummary = useMemo(() => {
    if (!context) return '—';
    const parts: string[] = [];
    if (tripContext.label) parts.push(tripContext.label);
    if (context.categoryId) parts.push(`category: ${context.categoryId}`);
    if (context.placeType) parts.push(`place type: ${context.placeType}`);
    if (context.destination) parts.push(`destination: ${context.destination}`);
    return parts.length > 0 ? parts.join(' · ') : 'general (no category, place type or destination)';
  }, [context, tripContext.label]);

  return (
    <section className="panel" aria-labelledby="video-heading">
      <div className="panel-heading">
        <h2 id="video-heading">Video &amp; experiences</h2>
        <span className="panel-hint">
          {acceptedCount > 0
            ? `${acceptedCount} clip${acceptedCount === 1 ? '' : 's'} uploaded`
            : 'Local files only — nothing is uploaded to a server'}
        </span>
      </div>

      {/* ---- Upload ---- */}
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          id="video-file-input"
          className="visually-hidden"
          type="file"
          accept="video/*,.mp4,.webm,.mov,.m4v,.ogv,.mkv,.avi"
          multiple
          onChange={onInputChange}
          aria-label="Choose video files to upload"
        />
        <p className="dropzone-title">Add your video clips</p>
        <p className="dropzone-hint">
          Drag files here, or{' '}
          <button type="button" className="link-button" onClick={openPicker}>
            choose files
          </button>
          . Select several clips from the same Experience to test continuous music across them.
        </p>
        <div className="dropzone-actions">
          <button type="button" className="btn btn-primary" onClick={openPicker}>
            Choose videos
          </button>
          {acceptedCount > 0 && (
            <button type="button" className="btn" onClick={clearClips}>
              Remove all
            </button>
          )}
        </div>
      </div>

      {rejected.length > 0 && (
        <p className="inline-warning" role="alert">
          Skipped {rejected.length} file{rejected.length === 1 ? '' : 's'} that are not video:{' '}
          {rejected.join(', ')}
        </p>
      )}

      {/* ---- Experience music context ---- */}
      <div className="subsection">
        <h3>Music context for this Experience</h3>
        <p className="subsection-hint">
          Every clip in one Experience shares this context, so the music keeps playing as you move
          between clips. Change the context to trigger a new recommendation.
        </p>

        <div className="field-grid">
          <div className="field">
            <label className="field-label" htmlFor="trip-label">
              Place label (optional)
            </label>
            <input
              id="trip-label"
              type="text"
              value={tripContext.label ?? ''}
              placeholder="e.g. Kuala Lumpur mall"
              onChange={(event) =>
                updateTripContext({
                  ...tripContext,
                  label: event.target.value === '' ? null : event.target.value,
                })
              }
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="trip-category">
              Category
            </label>
            <select
              id="trip-category"
              value={tripContext.categoryId ?? ''}
              onChange={(event) =>
                updateTripContext({
                  ...tripContext,
                  categoryId: event.target.value === '' ? null : event.target.value,
                })
              }
            >
              <option value="">No category (fallback)</option>
              {taxonomyData.category_ids.map((category) => (
                <option key={category.category_id} value={category.category_id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="trip-place-type">
              Place type
            </label>
            <select
              id="trip-place-type"
              value={tripContext.placeType ?? ''}
              onChange={(event) =>
                updateTripContext({
                  ...tripContext,
                  placeType: event.target.value === '' ? null : event.target.value,
                })
              }
            >
              <option value="">No place type</option>
              {taxonomyData.place_types.map((place) => (
                <option key={place.place_type} value={place.place_type}>
                  {place.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="trip-destination">
              Destination
            </label>
            <input
              id="trip-destination"
              type="text"
              value={tripContext.destination ?? ''}
              placeholder="e.g. Kuala Lumpur"
              list="glassnik-destinations"
              onChange={(event) =>
                updateTripContext({
                  ...tripContext,
                  destination: event.target.value === '' ? null : event.target.value,
                })
              }
            />
            <datalist id="glassnik-destinations">
              {[
                'Kuala Lumpur',
                'Tokyo',
                'Phu Quoc',
                'Paris',
                'Auckland',
                'Lisbon',
                'Singapore',
                'Melbourne',
                'Kyoto',
                'Barcelona',
              ].map((destination) => (
                <option key={destination} value={destination} />
              ))}
            </datalist>
          </div>
        </div>

        <p className="context-preview">
          <span className="context-preview-label">Resolved context</span>
          <code>{context?.key ?? '—'}</code>
          <span className="context-preview-detail">{contextSummary}</span>
        </p>
      </div>

      {/* ---- Playback surface ---- */}
      <div className="subsection">
        <div className="subsection-heading">
          <h3>Clip playback</h3>
          {!musicEnabled && (
            <span className="badge badge-warn">Music is off — switch it on in the player</span>
          )}
        </div>

        <VideoSurface clip={activeClip} onStatusChange={setVideoStatus} />

        {sourceMode === 'clips' && activeClip ? (
          <p className="note">
            Continuous music is active for this Experience: moving to the next clip keeps the current
            track playing, because all clips share one context.
          </p>
        ) : (
          <p className="note">
            The bundled sample experiences are driving the music right now. Upload a clip to switch
            to your own videos.
          </p>
        )}
      </div>

      {/* ---- Clip list ---- */}
      {clips.length > 0 && (
        <div className="subsection">
          <div className="subsection-heading">
            <h3>Clips in this Experience</h3>
            <span className="panel-hint">
              Video error state: {videoStatus}
            </span>
          </div>
          <ol className="clip-list">
            {clips.map((clip, index) => (
              <li key={clip.id}>
                <div className={`clip-row${index === activeClipIndex ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="clip-select"
                    onClick={() => goToClip(index)}
                    aria-current={index === activeClipIndex ? 'true' : undefined}
                  >
                    <span className="clip-index">{index + 1}</span>
                    <span className="clip-name" title={clip.name}>
                      {clip.name}
                    </span>
                    <span className="clip-duration">
                      {formatDuration(durations[clip.id] ?? null)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => removeClip(clip.id)}
                    aria-label={`Remove clip ${clip.name}`}
                  >
                    Remove
                  </button>
                  {/* Duration is measured from the real file, never invented. */}
                  <video
                    className="visually-hidden"
                    preload="metadata"
                    src={URL.createObjectURL(clip.file)}
                    onLoadedMetadata={(event) => {
                      const seconds = event.currentTarget.duration;
                      setDurations((current) =>
                        current[clip.id] === seconds
                          ? current
                          : { ...current, [clip.id]: seconds },
                      );
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>

          <div className="clip-nav">
            <button
              type="button"
              className="btn"
              onClick={() => goToClip(activeClipIndex - 1)}
              disabled={activeClipIndex <= 0}
            >
              ← Previous clip
            </button>
            <span className="video-context">
              clip {activeClipIndex + 1} of {clips.length}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => goToClip(activeClipIndex + 1)}
              disabled={activeClipIndex >= clips.length - 1}
            >
              Next clip →
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
