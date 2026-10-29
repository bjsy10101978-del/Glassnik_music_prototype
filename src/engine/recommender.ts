/**
 * Glassnik recommendation engine.
 *
 * Deterministic, UI-free selection logic driven only by documented metadata
 * from `data/catalogue.json`, `data/taxonomy.json` and
 * `data/sample_experiences.json`.
 *
 * Matching precedence (documented, fixed):
 *   1. category_match     – track.categories contains the experience category_id
 *   2. place_type_match   – track.place_types contains the experience place_type
 *   3. destination_match  – track.destinations contains the experience destination
 *   4. general_fallback   – any structurally valid, playable, mode-eligible track
 *
 * Category comes first so that a context with both category and place type is
 * always served by its own category pool (for example the Kuala Lumpur
 * shopping sequence, whose first video is city centre). Place types are the
 * bridge for contexts without a category: the missing-category experience
 * (place type city centre) matches the versatile general-pool tracks there
 * instead of dropping to the bare fallback.
 *
 * Within the winning tier, candidates are ranked deterministically by:
 *   a. played-longest-ago first, when every candidate has already played
 *      (the pool then alternates instead of sticking on one track)
 *   b. number of preferred moods shared with the experience music_context
 *   c. whether track.energy falls inside the experience energy_range
 *   d. ascending track_id (stable final tie-break)
 *
 * Anti-stereotype rule: destination strings are only compared as literal
 * catalogue metadata. There is no country/city -> genre mapping anywhere in
 * this module. Tokyo never implies "traditional Japanese music" and Paris
 * never implies "accordion music"; those genres simply are not in the
 * synthetic catalogue and are never inferred.
 */
import { toAudioUrl } from '../audioManifest';
import type {
  RecommendInput,
  Recommendation,
  RecommendationContext,
  RecommendationReason,
  Track,
} from '../types';
import type { Experience, GroupingFilter } from '../types';

const TIER_ORDER: RecommendationReason[] = [
  'category_match',
  'place_type_match',
  'destination_match',
  'general_fallback',
];

/** Lower-case, trim and collapse separators so tag comparisons are safe. */
export function normalizeTag(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized === '' ? null : normalized;
}

function normalizedList(values: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map(normalizeTag).filter((v): v is string => v !== null);
}

/**
 * Context key: consecutive videos of one sequence share a single music
 * decision. Records without a sequence_group are their own context.
 */
export function resolveContextKey(experience: Experience): string {
  return experience.sequence_group ?? experience.experience_id;
}

/** Builds the resolved recommendation context for an experience. */
export function buildContext(experience: Experience): RecommendationContext {
  const key = resolveContextKey(experience);
  const inSequence = experience.sequence_group !== null;
  return {
    key,
    label: inSequence
      ? `${experience.sequence_group} · video ${experience.sequence_index ?? '?'}`
      : experience.experience_id,
    categoryId: experience.category_id,
    placeType: experience.place_type,
    destination: experience.destination,
    preferredMoods: normalizedList(experience.music_context?.preferred_moods),
    energyRange: experience.music_context?.energy_range ?? null,
  };
}

/**
 * Picks the item that speaks for a whole trip.
 *
 * A trip makes ONE music decision, so the context has to be stable while the
 * user moves through it:
 *  - a sequence of videos is represented by its first video
 *  - an uploaded trip is represented by its first clip
 *  - a standalone experience represents itself
 *
 * Without this rule the five videos of the Kuala Lumpur shopping sequence
 * would each carry a different place type (city centre, street market, mall,
 * city centre, night market) and the music would change in the middle of the
 * trip, which breaks continuous playback.
 */
export function resolveContextSource(
  experience: Experience,
  tripMembers: Experience[],
): Experience {
  if (!experience.sequence_group) return experience;
  const members = tripMembers
    .filter((member) => member.sequence_group === experience.sequence_group)
    .sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0));
  return members[0] ?? experience;
}

/**
 * Grouping browse: one soundtrack per Category, Place or Location.
 *
 * When the viewer browses by a grouping (the active Category, Place or
 * Location filter — exactly the three ways Glassnik organises Experiences),
 * every Experience inside that grouping shares ONE music decision, and
 * switching to a different grouping starts a new one. This is the rule the
 * music brief calls out as the most important behaviour:
 *
 *   - scrolling through Experiences inside a grouping keeps the music going
 *   - opening different Experiences in the grouping never restarts the track
 *   - switching to another grouping changes the music automatically
 *
 * The decision has to stay deterministic, so the grouping is represented by
 * its FIRST Experience in catalogue order (the same rule the sequence
 * context uses: its first video speaks for the whole sequence).
 */

/** Stable context key for a grouping. No Experience id is involved. */
export function groupingContextKey(grouping: GroupingFilter): string {
  return `browse:${grouping.type}:${normalizeTag(grouping.value) ?? 'unknown'}`;
}

/** Every Experience inside the grouping, in catalogue order. */
export function groupingMembers(
  grouping: GroupingFilter,
  all: Experience[],
): Experience[] {
  const wanted = normalizeTag(grouping.value);
  return all.filter((experience) => {
    const owned =
      grouping.type === 'location'
        ? normalizeTag(experience.destination)
        : grouping.type === 'category'
          ? normalizeTag(experience.category_id)
          : normalizeTag(experience.place_type);
    return owned !== null && owned === wanted;
  });
}

/**
 * The Experience that speaks for the whole grouping (first in catalogue
 * order), or null when the grouping has no member Experiences. The caller
 * falls back to per-Experience behaviour for empty groupings.
 */
export function resolveGroupingContextSource(
  grouping: GroupingFilter,
  all: Experience[],
): Experience | null {
  const members = groupingMembers(grouping, all);
  return members.length > 0 ? members[0] : null;
}

/** True when the track carries the structural fields the engine relies on. */
export function isStructurallyValid(track: Track): boolean {
  return (
    typeof track?.track_id === 'string' &&
    track.track_id.trim() !== '' &&
    typeof track?.title === 'string' &&
    track.title.trim() !== ''
  );
}

/** True when the track has a file_reference that resolves to an available file. */
export function isPlayable(track: Track, availableAudioFiles: string[]): boolean {
  return toAudioUrl(track.file_reference, availableAudioFiles) !== null;
}

/**
 * Production eligibility: the approval flag must be the strict boolean `true`
 * (missing/odd values are never treated as approval) and the review status
 * must not be a rejection.
 */
export function isProductionEligible(track: Track): boolean {
  return track.approved_for_production === true && track.review_status !== 'rejected';
}

export function isUnverified(track: Track): boolean {
  return (
    track.provenance?.status === 'research_candidate_unverified' ||
    track.source_url === null ||
    track.content_id_flag === 'unverified'
  );
}

function trackMatches(
  track: Track,
  reason: RecommendationReason,
  context: RecommendationContext,
): boolean {
  switch (reason) {
    case 'place_type_match': {
      const wanted = normalizeTag(context.placeType);
      return wanted !== null && normalizedList(track.place_types).includes(wanted);
    }
    case 'category_match': {
      const wanted = normalizeTag(context.categoryId);
      return wanted !== null && normalizedList(track.categories).includes(wanted);
    }
    case 'destination_match': {
      const wanted = normalizeTag(context.destination);
      return wanted !== null && normalizedList(track.destinations).includes(wanted);
    }
    case 'general_fallback':
      return true;
  }
}

function moodMatchCount(track: Track, preferred: string[]): number {
  if (preferred.length === 0) return 0;
  const trackMoods = new Set(normalizedList(track.moods));
  return preferred.filter((mood) => trackMoods.has(mood)).length;
}

function inEnergyRange(track: Track, range: [number, number] | null): boolean {
  if (!range) return false;
  const [min, max] = range;
  return typeof track.energy === 'number' && track.energy >= min && track.energy <= max;
}

const REASON_FIELD: Record<RecommendationReason, Recommendation['matchedField']> = {
  place_type_match: 'place_types',
  category_match: 'categories',
  destination_match: 'destinations',
  general_fallback: null,
};

function matchedValueFor(
  reason: RecommendationReason,
  context: RecommendationContext,
): string | null {
  switch (reason) {
    case 'place_type_match':
      return context.placeType;
    case 'category_match':
      return context.categoryId;
    case 'destination_match':
      return context.destination;
    case 'general_fallback':
      return null;
  }
}

function explain(
  reason: RecommendationReason,
  context: RecommendationContext,
  chosen: Track | null,
  repeatUnavoidable: boolean,
): string {
  if (!chosen) {
    return (
      'No playable track matched the place type, category or destination, and no ' +
      'eligible fallback track is available in this mode. Add or approve catalogue ' +
      'entries to produce a recommendation.'
    );
  }
  const value = matchedValueFor(reason, context);
  let base: string;
  switch (reason) {
    case 'place_type_match':
      base = `Place type match: the track's place types include "${value}".`;
      break;
    case 'category_match':
      base = `Category match: the track's categories include "${value}", the experience category.`;
      break;
    case 'destination_match':
      base = `Destination match: the track's destinations include "${value}" (literal metadata match, not a cultural association).`;
      break;
    case 'general_fallback':
      base =
        'General fallback: no track matched the place type, category or destination ' +
        'among playable tracks, so a general-purpose track was ranked by mood and energy fit.';
      break;
  }
  if (repeatUnavoidable) {
    return `${base} No unplayed candidate was left in this tier, so the track that was played longest ago is used again.`;
  }
  return base;
}

/**
 * Selects a track for a resolved context.
 *
 * The function is pure and deterministic: the same input always produces the
 * same output. Randomness is never used.
 */
export function recommend(input: RecommendInput): Recommendation {
  const { context, tracks, mode, availableAudioFiles } = input;
  // The order matters: it is the play order, oldest first.
  const avoidOrder = (input.avoidTrackIds ?? []).filter((id) => typeof id === 'string');
  const avoid = new Set(avoidOrder);

  const structuralValid = tracks.filter(isStructurallyValid);
  const playable = structuralValid.filter((t) => isPlayable(t, availableAudioFiles));

  const productionExcluded =
    mode === 'production'
      ? playable.filter((t) => !isProductionEligible(t)).length
      : 0;
  const eligible =
    mode === 'production' ? playable.filter(isProductionEligible) : playable;

  const tierCounts = {} as Record<RecommendationReason, number>;
  for (const reason of TIER_ORDER) {
    tierCounts[reason] = eligible.filter((t) => trackMatches(t, reason, context)).length;
  }

  let reason: RecommendationReason | null = null;
  let tier: Track[] = [];
  for (const candidateReason of TIER_ORDER) {
    const matches = eligible.filter((t) => trackMatches(t, candidateReason, context));
    if (matches.length > 0) {
      reason = candidateReason;
      tier = matches;
      break;
    }
  }

  const missingAudioFiles = structuralValid
    .map((t) => t.file_reference)
    .filter((ref): ref is string => typeof ref === 'string' && ref !== '')
    .filter((ref) => !availableAudioFiles.includes(ref));

  // Avoid immediate repetition when an alternative candidate exists.
  let pool = tier;
  let repeatUnavoidable = false;
  // Set when every candidate in the tier had already played: the ranking then
  // prefers the candidate that was played longest ago, so the queue keeps
  // moving instead of sticking on a single track.
  let exhaustedRank: Map<string, number> | null = null;
  if (tier.length > 0) {
    const fresh = tier.filter((t) => !avoid.has(t.track_id));
    if (fresh.length > 0) {
      pool = fresh;
    } else {
      repeatUnavoidable = avoid.size > 0;
      exhaustedRank = new Map(avoidOrder.map((id, index) => [id, index]));
    }
  }

  const notes: string[] = [];
  if (mode === 'production') {
    notes.push(
      `Production mode: only tracks with approved_for_production === true were eligible; ${productionExcluded} playable track(s) were excluded.`,
    );
  }
  if (missingAudioFiles.length > 0) {
    notes.push(
      `Catalogue references without a file on disk (excluded from playback): ${missingAudioFiles.join(', ')}.`,
    );
  }

  let chosen: Track | null = null;
  if (pool.length > 0) {
    const sorted = [...pool].sort((a, b) => {
      if (exhaustedRank) {
        // Every candidate had already played: the track played longest ago
        // wins outright, so the pool keeps alternating instead of sticking
        // on whoever has the best mood or energy score.
        const rankDiff =
          (exhaustedRank.get(a.track_id) ?? Number.MAX_SAFE_INTEGER) -
          (exhaustedRank.get(b.track_id) ?? Number.MAX_SAFE_INTEGER);
        if (rankDiff !== 0) return rankDiff;
      }
      const moodDiff =
        moodMatchCount(b, context.preferredMoods) - moodMatchCount(a, context.preferredMoods);
      if (moodDiff !== 0) return moodDiff;
      const energyDiff =
        Number(inEnergyRange(b, context.energyRange)) - Number(inEnergyRange(a, context.energyRange));
      if (energyDiff !== 0) return energyDiff;
      return a.track_id < b.track_id ? -1 : a.track_id > b.track_id ? 1 : 0;
    });
    chosen = sorted[0];
  }

  const resolvedReason: RecommendationReason = reason ?? 'general_fallback';

  return {
    contextKey: context.key,
    reason: resolvedReason,
    explanation: explain(resolvedReason, context, chosen, repeatUnavoidable),
    track: chosen,
    matchedValue: chosen ? matchedValueFor(resolvedReason, context) : null,
    matchedField: chosen ? REASON_FIELD[resolvedReason] : null,
    mode,
    tierCandidateCount: tier.length,
    eligibleCandidateCount: eligible.length,
    tierCounts,
    repeatUnavoidable,
    missingAudioFiles,
    unverified: chosen ? isUnverified(chosen) : false,
    notes,
  };
}
