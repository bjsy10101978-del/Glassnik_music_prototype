import type { JSX } from 'react';
import { toAudioUrl } from '../audioManifest';
import { useMusic } from '../player/MusicProvider';
import type { PlaybackStatus } from '../types';

function statusText(
  status: PlaybackStatus,
  error: string | null,
  hasTrack: boolean,
): string {
  switch (status) {
    case 'idle':
      return hasTrack ? 'Ready — press Play to start' : 'No track selected';
    case 'loading':
      return 'Loading audio…';
    case 'playing':
      return 'Playing';
    case 'paused':
      return 'Paused';
    case 'blocked':
      return error ?? 'Playback blocked — press Play';
    case 'error':
      return error ?? 'Audio failed to load';
  }
}

/**
 * The viewer-facing music bar.
 *
 * Deliberately minimal, per the product rule: no track names or artist
 * names are shown over the videos. Track details live on the Music credits
 * page. The source menu mirrors the planned Glassnik integration menu
 * (Glassnik Music / Spotify / No Music), with Spotify kept visible but
 * unavailable until that future integration exists.
 */
export function PlayerBar(): JSX.Element {
  const {
    recommendation,
    engineState,
    musicEnabled,
    toggleMusic,
    volume,
    setVolume,
    togglePlayPause,
    nextTrack,
  } = useMusic();

  const track = recommendation?.track ?? null;
  const audioUrl = track ? toAudioUrl(track.file_reference) : null;
  const hasTrack = Boolean(track && audioUrl);
  const isPlaying = engineState.status === 'playing' || engineState.status === 'loading';

  return (
    <section className="player" aria-label="Music player">
      <div className="player-track">
        <span className="player-music-label" aria-hidden="true">
          ♫ Music
        </span>
        <span className={`player-status status-${engineState.status}`} role="status">
          {statusText(engineState.status, engineState.error, hasTrack)}
        </span>
      </div>

      <div className="player-controls">
        <button
          type="button"
          className="btn btn-primary"
          onClick={togglePlayPause}
          disabled={!hasTrack}
          aria-label={isPlaying ? 'Pause music' : 'Play music'}
        >
          {isPlaying ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={nextTrack}
          disabled={!hasTrack}
          aria-label="Skip to next recommended track"
        >
          ⏭ Next track
        </button>
        <label className="source-select">
          <span className="volume-label">Music source</span>
          <select
            aria-label="Music source"
            value={musicEnabled ? 'glassnik' : 'none'}
            onChange={(event) => toggleMusic(event.target.value !== 'none')}
          >
            <option value="glassnik">Glassnik Music</option>
            <option value="spotify" disabled>
              Spotify — future integration
            </option>
            <option value="none">No Music</option>
          </select>
        </label>
        <label className="volume">
          <span className="volume-label">Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(event) => setVolume(Number(event.target.value) / 100)}
            aria-label="Volume"
            aria-valuetext={`${Math.round(volume * 100)} percent`}
          />
          <span className="volume-value">{Math.round(volume * 100)}%</span>
        </label>
      </div>

      {engineState.status === 'error' && (
        <p className="player-error" role="alert">
          {engineState.error ?? 'Audio error'} — you can retry with Play.
        </p>
      )}
    </section>
  );
}
