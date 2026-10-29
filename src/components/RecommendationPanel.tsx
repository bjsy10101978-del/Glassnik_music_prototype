import type { JSX } from 'react';
import { useMusic } from '../player/MusicProvider';
import type { RecommendationReason } from '../types';

const REASON_LABEL: Record<RecommendationReason, string> = {
  place_type_match: 'Place type match',
  category_match: 'Category match',
  destination_match: 'Destination match',
  general_fallback: 'General fallback',
};

export function RecommendationPanel(): JSX.Element {
  const { recommendation, context, mode, setMode, selectedExperience } = useMusic();

  const track = recommendation?.track ?? null;
  const approved = track?.approved_for_production === true;

  return (
    <section className="panel" aria-labelledby="recommendation-heading">
      <div className="panel-heading">
        <h2 id="recommendation-heading">Recommendation</h2>
        <div className="mode-switch" role="radiogroup" aria-label="Recommendation mode">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'research'}
            className={`btn btn-segment${mode === 'research' ? ' active' : ''}`}
            onClick={() => setMode('research')}
          >
            Research mode
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'production'}
            className={`btn btn-segment${mode === 'production' ? ' active' : ''}`}
            onClick={() => setMode('production')}
          >
            Production mode
          </button>
        </div>
      </div>

      <p className="mode-explainer">
        {mode === 'research'
          ? 'Research mode considers every structurally valid catalogue entry that has a playable audio file. Records are synthetic and unverified.'
          : 'Production mode only considers entries with approved_for_production === true. Missing approval is never treated as approval.'}
      </p>
      <p className="mode-explainer mode-explainer-warn">
        Research inspector: this panel exists to explain and debug the music
        decisions. The Glassnik viewer itself shows no track names or artist
        names — details belong on the Music credits page only.
      </p>

      {recommendation && track ? (
        <>
          <div className="recommendation-card">
            <div className="recommendation-main">
              <span className={`reason-chip reason-${recommendation.reason}`}>
                {REASON_LABEL[recommendation.reason]}
              </span>
              <h3 className="track-title">{track.title}</h3>
              <p className="track-artist">{track.artist}</p>
              <p className="recommendation-explanation">{recommendation.explanation}</p>
            </div>
            <ul className="track-chips" aria-label="Track metadata">
              <li>{track.genres.join(', ') || 'no genre'}</li>
              <li>mood: {track.moods.join(', ') || '—'}</li>
              <li>energy: {track.energy.toFixed(2)}</li>
              <li>{track.bpm !== null ? `${track.bpm} BPM` : 'BPM unknown'}</li>
              <li>{track.vocals}</li>
            </ul>
          </div>

          <dl className="detail-grid detail-grid-tight">
            <div>
              <dt>Matched rule</dt>
              <dd>
                {recommendation.matchedField && recommendation.matchedValue ? (
                  <>
                    <code>
                      {recommendation.matchedField} ∋ {recommendation.matchedValue}
                    </code>
                  </>
                ) : (
                  <span>no metadata match — general pool</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Context</dt>
              <dd>
                <code>{context?.key ?? '—'}</code>
              </dd>
            </div>
            <div>
              <dt>Production eligibility</dt>
              <dd>
                {approved ? (
                  <span className="badge badge-ok">approved_for_production: true</span>
                ) : (
                  <span className="badge badge-warn">
                    research only — approved_for_production: {String(track.approved_for_production)}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Data provenance</dt>
              <dd>
                <span className="badge badge-warn">{track.provenance?.status ?? 'unknown'}</span>
              </dd>
            </div>
          </dl>

          {recommendation.notes.length > 0 && (
            <ul className="note-list">
              {recommendation.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </>
      ) : recommendation && !track ? (
        <div className="empty-state" role="status">
          <h3>No playable track for this context</h3>
          <p>{recommendation.explanation}</p>
          <p className="muted">
            Current context: <code>{context?.key ?? selectedExperience.experience_id}</code>
          </p>
        </div>
      ) : (
        <p className="muted">Resolving recommendation…</p>
      )}
    </section>
  );
}
