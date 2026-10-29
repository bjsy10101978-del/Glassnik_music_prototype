import type { JSX } from 'react';
import { toAudioUrl } from '../audioManifest';
import { useMusic } from '../player/MusicProvider';
import { tracks } from '../data/dataset';

/**
 * Music credits page.
 *
 * Product rule: the Glassnik video viewer never displays track names or
 * artist names - Eye-POV Experiences are the focus, not the music. Track
 * information lives here instead, reachable from the app menu, which is the
 * place any licence-required attribution can be given once the licences are
 * verified. Attribution on this page is a possible solution, not an
 * automatic substitute for whatever a licence requires.
 *
 * The page is honest about the current state: every held recording is a
 * local file, no licence has been verified by a human yet, and the title /
 * artist names are placeholders until the sources are confirmed. See
 * data/licence-review.csv for the full verification register.
 */
const ORIGIN_LABEL: Record<string, string> = {
  approved_pool_recording: 'Local recording (full)',
  approved_pool_excerpt: 'Local excerpt (cut from a local recording)',
};

export function MusicCredits(): JSX.Element {
  const { recommendation, context } = useMusic();
  const track = recommendation?.track ?? null;

  return (
    <section className="panel credits" aria-labelledby="credits-heading">
      <h2 id="credits-heading">Music credits</h2>
      <p className="panel-hint">
        Track and artist names are not shown over Experiences in the viewer.
        Music plays in the background while viewers scroll, and this page is
        where the music is credited.
      </p>

      <div className="credits-notice" role="note">
        <strong>Licensing status — honest and open:</strong> all music here is
        a held library of local recordings. No usage rights have been
        verified by a person yet, so none of it may ship in a product
        pointing at real viewers. Title and artist names are placeholders
        until the sources are confirmed. The full per-track verification
        register lives in <code>data/licence-review.csv</code>.
      </div>

      <section className="diag-section">
        <h3>Now playing</h3>
        {track ? (
          <dl className="detail-grid detail-grid-tight">
            <div className="detail">
              <dt>Track</dt>
              <dd>{track.title}</dd>
            </div>
            <div className="detail">
              <dt>Recorded artist</dt>
              <dd>{track.artist}</dd>
            </div>
            <div className="detail">
              <dt>Audio file</dt>
              <dd>
                <code>{toAudioUrl(track.file_reference) ?? track.file_reference}</code>
              </dd>
            </div>
            <div className="detail">
              <dt>Grouping</dt>
              <dd>{context?.key ?? '—'}</dd>
            </div>
            <div className="detail">
              <dt>Status</dt>
              <dd>Licence not verified — placeholder names, real local audio</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">No track selected yet.</p>
        )}
      </section>

      <section className="diag-section">
        <h3>All {tracks.length} tracks in the library</h3>
        <p className="muted">
          Every track is a local pool recording (or a locally cut excerpt of a
          byte-duplicate recording). None has a verified licence yet.
        </p>
        <div className="credits-table-wrap" tabIndex={0} aria-label="Track catalogue">
          <table className="credits-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Title</th>
                <th scope="col">Artist</th>
                <th scope="col">Audio origin</th>
                <th scope="col">Source URL status</th>
                <th scope="col">Licence verified</th>
                <th scope="col">Production approved</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((entry) => {
                const origin = String(entry.provenance?.audio_origin ?? '');
                return (
                  <tr key={entry.track_id}>
                    <td>{entry.track_id.replace('glassnik-', '')}</td>
                    <td>{entry.title}</td>
                    <td>{entry.artist}</td>
                    <td>{ORIGIN_LABEL[origin] ?? origin}</td>
                    <td>
                      {entry.source_url_status === 'candidate_unverified'
                        ? 'Candidate, unopened'
                        : String(entry.source_url_status ?? '')}
                    </td>
                    <td>No — pending human verification</td>
                    <td>
                      {entry.approved_for_production
                        ? 'Yes (pool-backed convention)'
                        : 'No'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
