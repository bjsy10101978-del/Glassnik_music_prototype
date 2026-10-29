import type { JSX } from 'react';
import { AUDIO_LIBRARY, AVAILABLE_AUDIO_FILES, toAudioUrl } from '../audioManifest';
import { useMusic } from '../player/MusicProvider';

function levelLabel(level: string): string {
  return level.toUpperCase();
}

export function DiagnosticsPanel(): JSX.Element {
  const {
    validation,
    datasetStatus,
    datasetNotice,
    selectedExperience,
    context,
    recommendation,
    engineState,
    mode,
  } = useMusic();

  const track = recommendation?.track ?? null;
  const audioUrl = track ? toAudioUrl(track.file_reference) : null;
  const errors = validation.issues.filter((i) => i.level === 'error');
  const warnings = validation.issues.filter((i) => i.level === 'warning');
  const infos = validation.issues.filter((i) => i.level === 'info');

  return (
    <details className="panel diagnostics" open>
      <summary>
        <h2>Diagnostics</h2>
        <span className="panel-hint">
          {validation.summary.errorCount} errors · {validation.summary.warningCount} warnings
        </span>
      </summary>

      <div className="diagnostics-body">
        <section className="diag-section">
          <h3>Selected experience</h3>
          <dl className="detail-grid detail-grid-tight">
            <div>
              <dt>ID</dt>
              <dd>
                <code>{selectedExperience.experience_id}</code>
              </dd>
            </div>
            <div>
              <dt>Title</dt>
              <dd>{selectedExperience.title}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>
                <code>{selectedExperience.category_id ?? 'null'}</code>
              </dd>
            </div>
            <div>
              <dt>Place type</dt>
              <dd>
                <code>{selectedExperience.place_type ?? 'null'}</code>
              </dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>{selectedExperience.destination ?? 'null'}</dd>
            </div>
            <div>
              <dt>Video reference</dt>
              <dd>{selectedExperience.video_reference ?? 'null (simulated video)'}</dd>
            </div>
          </dl>
        </section>

        <section className="diag-section">
          <h3>Resolved recommendation context</h3>
          <dl className="detail-grid detail-grid-tight">
            <div>
              <dt>Context key</dt>
              <dd>
                <code>{context?.key ?? '—'}</code>
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{context?.label ?? '—'}</dd>
            </div>
            <div>
              <dt>Preferred moods</dt>
              <dd>{context?.preferredMoods.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt>Energy range</dt>
              <dd>{context?.energyRange ? `[${context.energyRange[0]}, ${context.energyRange[1]}]` : '—'}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{mode}</dd>
            </div>
          </dl>
        </section>

        <section className="diag-section">
          <h3>Matching rules applied</h3>
          <p className="muted">
            Fixed precedence: place type → category → destination → general fallback. Within the
            winning tier: preferred-mood overlap, then energy inside range, then ascending track id.
            No destination-to-genre or country-to-music rules exist.
          </p>
          {recommendation ? (
            <ul className="diag-list">
              <li>
                Winner: <strong>{recommendation.reason}</strong>
                {recommendation.matchedValue ? ` (${recommendation.matchedValue})` : ''}
              </li>
              <li>
                Candidates per tier — place type: {recommendation.tierCounts.place_type_match},
                category: {recommendation.tierCounts.category_match}, destination:{' '}
                {recommendation.tierCounts.destination_match}, fallback pool:{' '}
                {recommendation.tierCounts.general_fallback}
              </li>
              <li>Eligible after mode + playability filters: {recommendation.eligibleCandidateCount}</li>
              <li>
                Repetition avoided: {recommendation.repeatUnavoidable ? 'no — only candidate reused' : 'n/a or applied'}
              </li>
            </ul>
          ) : (
            <p className="muted">No decision yet.</p>
          )}
        </section>

        <section className="diag-section">
          <h3>Selected track &amp; audio</h3>
          <dl className="detail-grid detail-grid-tight">
            <div>
              <dt>Track</dt>
              <dd>
                {track ? (
                  <code>
                    {track.track_id} — {track.title}
                  </code>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Audio URL</dt>
              <dd>
                <code>{audioUrl ?? '—'}</code>
              </dd>
            </div>
            <div>
              <dt>Catalogue file_reference</dt>
              <dd>
                <code>{track?.file_reference ?? '—'}</code>
              </dd>
            </div>
            <div>
              <dt>Playback status</dt>
              <dd>
                <span className={`badge engine-${engineState.status}`}>{engineState.status}</span>
                {engineState.error ? ` — ${engineState.error}` : ''}
              </dd>
            </div>
          </dl>
        </section>

        <section className="diag-section">
          <h3>Validation</h3>
          <p className="muted">
            Dataset status: <code>{datasetStatus}</code>. Tracks: {validation.summary.trackCount} ·
            playable: {validation.summary.playableTrackCount} · approved for production:{' '}
            {validation.summary.productionApprovedCount} · invalid approval values:{' '}
            {validation.summary.invalidApprovalCount} · unique checksums:{' '}
            {validation.summary.uniqueChecksumCount} · source URLs confirmed by a human:{' '}
            {validation.summary.sourceUrlVerifiedCount}.
          </p>
          <p className="muted">{datasetNotice}</p>

          <h4>Missing audio files</h4>
          {validation.summary.missingAudioFiles.length > 0 ? (
            <ul className="diag-list diag-warnings">
              {validation.summary.missingAudioFiles.map((file) => (
                <li key={file}>
                  <code>/{file}</code> is referenced by the catalogue but has no file under{' '}
                  <code>public/</code> — excluded from playback.
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">None — every referenced audio file exists on disk.</p>
          )}

          <h4>Playable audio files</h4>
          <p className="muted">
            {AUDIO_LIBRARY.length} files under <code>public/audio/</code> ·{' '}
            {validation.summary.uniqueChecksumCount} unique SHA-256 checksums ·{' '}
            {validation.summary.duplicateChecksumCount} duplicate checksum(es) ·{' '}
            {Math.round(
              AUDIO_LIBRARY.reduce((total, entry) => total + entry.duration_seconds, 0),
            )}{' '}
            seconds of audio in total.
          </p>
          <details>
            <summary>List every available file ({AVAILABLE_AUDIO_FILES.length})</summary>
            <ul className="diag-list">
              {AVAILABLE_AUDIO_FILES.map((file) => (
                <li key={file}>
                  <code>/{file}</code> — available for playback.
                </li>
              ))}
            </ul>
          </details>

          {errors.length > 0 && (
            <>
              <h4>Errors</h4>
              <ul className="diag-list diag-errors">
                {errors.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>
                    [{levelLabel(issue.level)}] {issue.message}{' '}
                    {issue.path ? <code>{issue.path}</code> : null}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4>Warnings</h4>
          {warnings.length > 0 ? (
            <ul className="diag-list diag-warnings">
              {warnings.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  [{issue.code}] {issue.message} {issue.path ? <code>{issue.path}</code> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">None.</p>
          )}

          <details>
            <summary>Informational findings ({infos.length})</summary>
            <ul className="diag-list">
              {infos.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  [{issue.code}] {issue.message}
                </li>
              ))}
            </ul>
          </details>
        </section>
      </div>
    </details>
  );
}
