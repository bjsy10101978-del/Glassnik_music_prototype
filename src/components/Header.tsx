import type { JSX } from 'react';
import { useMusic } from '../player/MusicProvider';
import type { PlaybackStatus } from '../types';

const STATUS_LABEL: Record<PlaybackStatus, string> = {
  idle: 'Engine idle',
  loading: 'Engine loading',
  playing: 'Engine active',
  paused: 'Engine paused',
  blocked: 'Engine blocked',
  error: 'Engine error',
};

export function Header(): JSX.Element {
  const { engineState } = useMusic();
  const status = engineState.status;

  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          ◆
        </span>
        <div>
          <h1>Glassnik</h1>
          <p className="tagline">
            Background music that follows Eye-POV Experiences by Category, Place and Location.
          </p>
        </div>
      </div>
      <div className="header-badges">
        <span className="badge badge-warn">Research prototype · music rights unverified</span>
        <span
          className={`badge engine-badge engine-${status}`}
          role="status"
          aria-live="polite"
        >
          <span className={`dot dot-${status}`} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
      </div>
    </header>
  );
}
