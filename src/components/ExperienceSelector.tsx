import type { JSX } from 'react';
import { useMemo } from 'react';
import { taxonomyData, tracks } from '../data/dataset';
import { useMusic } from '../player/MusicProvider';
import type { GroupingFilter, GroupingType } from '../types';

function categoryLabel(id: string | null): string {
  if (!id) return '—';
  return taxonomyData.category_ids.find((c) => c.category_id === id)?.label ?? id;
}

function placeTypeLabel(id: string | null): string {
  if (!id) return '—';
  return taxonomyData.place_types.find((p) => p.place_type === id)?.label ?? id;
}

/** Decodes a select value of the shape `type:value` back into a grouping. */
function parseGroupingValue(raw: string): GroupingFilter {
  const separatorIndex = raw.indexOf(':');
  const type = separatorIndex === -1 ? '' : raw.slice(0, separatorIndex);
  const value = separatorIndex === -1 ? '' : raw.slice(separatorIndex + 1);
  const safeType: GroupingType =
    type === 'location' || type === 'category' || type === 'place_type'
      ? type
      : 'location';
  return { type: safeType, value };
}

export function ExperienceSelector(): JSX.Element {
  const {
    experiences,
    selectedExperience,
    selectExperience,
    sequence,
    goToVideo,
    browseAllTracks,
    setBrowseAllTracks,
    groupingFilter,
    setGroupingFilter,
    groupingItems,
  } = useMusic();

  /**
   * The grouping options come from the sample data itself, so every option
   * really has Experiences behind it. Categories and place types get their
   * human labels from the taxonomy; locations are kept as recorded.
   */
  const groupingOptions = useMemo(() => {
    const locations = [...new Set(experiences.map((e) => e.destination).filter((v): v is string => v !== null))];
    const categories = [
      ...new Set(experiences.map((e) => e.category_id).filter((v): v is string => v !== null)),
    ];
    const placeTypes = [
      ...new Set(experiences.map((e) => e.place_type).filter((v): v is string => v !== null)),
    ];
    return { locations, categories, placeTypes };
  }, [experiences]);

  const selectedValue = groupingFilter
    ? `${groupingFilter.type}:${groupingFilter.value}`
    : '';

  const listed = groupingFilter ? groupingItems : experiences;
  const selectedGroupedBy = groupingFilter !== null;

  return (
    <section className="panel" aria-labelledby="experience-heading">
      <div className="panel-heading">
        <h2 id="experience-heading">Experience</h2>
        <span className="panel-hint">Simulated video selection — no video files are played</span>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <strong>Browse all {tracks.length} tracks</strong>
            <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>
              When on, Next Track / auto-advance cycles through every track in the catalogue.
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={browseAllTracks}
              onChange={(event) => setBrowseAllTracks(event.target.checked)}
            />
            <span>{browseAllTracks ? 'On' : 'Off'}</span>
          </label>
        </div>
      </div>

      {/*
       * Grouping browse — the music brief's central behaviour.
       * While a Category, Place or Location grouping is active, every
       * Experience inside it shares ONE soundtrack: opening another
       * Experience keeps the music playing; only switching the grouping
       * itself changes the selection.
       */}
      <div className="panel" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 260, flexGrow: 1 }}>
            <strong>Explore by Category, Place or Location</strong>
            <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>
              One soundtrack per grouping: music continues across different Experiences inside
              the grouping and changes when the grouping changes.
            </div>
          </div>
          <label className="field-label" htmlFor="grouping-select">
            Grouping
            <select
              id="grouping-select"
              aria-label="Explore grouping"
              value={selectedValue}
              onChange={(event) => {
                const raw = event.target.value;
                setGroupingFilter(raw === '' ? null : parseGroupingValue(raw));
              }}
            >
              <option value="">Every Experience separately</option>
              <optgroup label="Location">
                {groupingOptions.locations.map((value) => (
                  <option key={`location:${value}`} value={`location:${value}`}>
                    All Experiences in {value}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Category">
                {groupingOptions.categories.map((value) => (
                  <option key={`category:${value}`} value={`category:${value}`}>
                    All {categoryLabel(value)} Experiences
                  </option>
                ))}
              </optgroup>
              <optgroup label="Place type">
                {groupingOptions.placeTypes.map((value) => (
                  <option key={`place_type:${value}`} value={`place_type:${value}`}>
                    All {placeTypeLabel(value)} places
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        </div>
        <p className="note">
          {selectedGroupedBy
            ? `${groupingItems.length} Experience${groupingItems.length === 1 ? '' : 's'} share one soundtrack in this grouping. Open a different Experience below — the music keeps playing.`
            : 'Pick a grouping above to see the brief rule: music continues across Experiences within one Category, Place or Location, and changes when you switch.'}
        </p>
      </div>

      <ul className="experience-list" role="list">
        {listed.map((experience) => {
          const isSelected = experience.experience_id === selectedExperience.experience_id;
          return (
            <li key={experience.experience_id}>
              <button
                type="button"
                className={`experience-item${isSelected ? ' selected' : ''}`}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => selectExperience(experience.experience_id)}
              >
                <span className="experience-title">{experience.title}</span>
                <span className="experience-meta">
                  {experience.destination ?? 'No destination'} ·{' '}
                  {categoryLabel(experience.category_id)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="experience-detail">
        <dl className="detail-grid">
          <div>
            <dt>Location</dt>
            <dd>{selectedExperience.destination ?? '—'}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{categoryLabel(selectedExperience.category_id)}</dd>
          </div>
          <div>
            <dt>Place type</dt>
            <dd>{placeTypeLabel(selectedExperience.place_type)}</dd>
          </div>
          <div>
            <dt>Destination tag</dt>
            <dd>{selectedExperience.destination ?? '—'}</dd>
          </div>
          <div>
            <dt>Metadata status</dt>
            <dd>
              <span className="badge badge-warn">{selectedExperience.metadata_status}</span>
            </dd>
          </div>
        </dl>

        {sequence.group ? (
          <div className="video-simulator">
            <div className="video-frame" aria-hidden="true">
              <span className="video-frame-icon">▶</span>
              <span className="video-frame-label">
                simulated video {sequence.currentIndex + 1} / {sequence.videos.length}
              </span>
            </div>
            <div className="video-controls">
              <button
                type="button"
                className="btn"
                onClick={() => goToVideo(sequence.currentIndex - 1)}
                disabled={sequence.currentIndex <= 0}
              >
                ← Previous video
              </button>
              <span className="video-context">
                Sequence <code>{sequence.group}</code> · video{' '}
                {sequence.currentIndex + 1} of {sequence.videos.length}
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => goToVideo(sequence.currentIndex + 1)}
                disabled={sequence.currentIndex >= sequence.videos.length - 1}
              >
                Next video →
              </button>
            </div>
            <p className="note">
              Videos in this sequence share one music context: changing video keeps the current
              track playing. This prototype simulates the video change only.
            </p>
          </div>
        ) : (
          <p className="note">
            This experience is not part of a sequence. Select a Kuala Lumpur shopping experience
            to see the five-video continuous playback sequence.
          </p>
        )}
      </div>
    </section>
  );
}
