/**
 * Uploaded clip model.
 *
 * Local video files chosen by the user are grouped into a single "trip": all
 * clips in one trip share one music context, which is what makes continuous
 * playback visible — moving from clip 1 to clip 2 keeps the same track
 * playing instead of restarting it.
 *
 * Clips are converted into the same `Experience` shape used by the bundled
 * sample data, so they flow through `buildContext()` and `recommend()`
 * unchanged. They are never written into data/sample_experiences.json.
 */
import type { Experience } from '../types';

export interface Clip {
  id: string;
  name: string;
  file: File;
}

export interface TripContext {
  /** Free-text place label, e.g. "Kuala Lumpur mall". */
  label: string | null;
  categoryId: string | null;
  placeType: string | null;
  destination: string | null;
  preferredMoods: string[];
}

export const TRIP_SEQUENCE_GROUP = 'uploaded-trip';

export function defaultTripContext(): TripContext {
  return {
    label: null,
    categoryId: 'shopping',
    placeType: null,
    destination: null,
    preferredMoods: [],
  };
}

/**
 * Builds one Experience per clip. Every clip shares `sequence_group`, so they
 * all resolve to the same recommendation context.
 */
export function buildClipExperiences(clips: Clip[], trip: TripContext): Experience[] {
  return clips.map((clip, index) => ({
    experience_id: `clip:${clip.id}`,
    title: clip.name,
    destination: trip.destination,
    category_id: trip.categoryId,
    place_type: trip.placeType,
    video_reference: null,
    sequence_group: TRIP_SEQUENCE_GROUP,
    sequence_index: index + 1,
    music_context:
      trip.preferredMoods.length > 0
        ? { preferred_moods: trip.preferredMoods, energy_range: [0.0, 1.0] }
        : { preferred_moods: [], energy_range: [0.0, 1.0] },
    metadata_status: 'local_upload_unverified',
    notes: 'Local uploaded clip. Not part of the project research dataset.',
  }));
}

/** Formats milliseconds as m:ss for the clip list. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
