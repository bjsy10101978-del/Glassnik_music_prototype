/**
 * Shared Glassnik prototype types.
 *
 * Field names mirror the real project schemas:
 *  - data/taxonomy.json      -> category_ids[], place_types[]
 *  - data/catalogue.json     -> tracks[]
 *  - data/sample_experiences.json -> experiences[]
 */

export type Vocals = 'unknown' | 'instrumental' | 'vocal' | 'mixed';

export type ContentIdFlag =
  | 'unverified'
  | 'clear'
  | 'potential_match'
  | 'matched'
  | 'not_applicable';

export type ReviewStatus =
  | 'pending_source_verification'
  | 'metadata_reviewed'
  | 'licence_reviewed'
  | 'rejected';

/**
 * How far the `source_url` of a track has been checked.
 *
 * `candidate_unverified` means the URL looks like a Pixabay Music track page
 * but nobody has opened it yet, so it must not be presented as a confirmed
 * source. `candidate_verified` means a human opened the page and confirmed the
 * track. `not_applicable` is used for locally generated audio that has no
 * external source at all.
 */
export type SourceUrlStatus = 'candidate_unverified' | 'candidate_verified' | 'not_applicable';

export interface TrackProvenance {
  status: string;
  note: string;
  [key: string]: unknown;
}

export interface Track {
  track_id: string;
  title: string;
  artist: string;
  source_url: string | null;
  /** Whether `source_url` has been confirmed by a human. */
  source_url_status: SourceUrlStatus;
  /** Working search page a reviewer can use to find the real track. */
  source_search_url: string | null;
  file_reference: string | null;
  checksum: string | null;
  duration_seconds: number | null;
  genres: string[];
  moods: string[];
  vocals: Vocals;
  energy: number;
  bpm: number | null;
  categories: string[];
  place_types: string[];
  destinations: string[];
  provenance: TrackProvenance;
  licence_source: string | null;
  content_id_flag: ContentIdFlag;
  review_status: ReviewStatus;
  approved_for_production: boolean;
}

export interface MusicContext {
  preferred_moods?: string[];
  energy_range?: [number, number];
}

export interface Experience {
  experience_id: string;
  title: string;
  destination: string | null;
  category_id: string | null;
  place_type: string | null;
  video_reference: string | null;
  sequence_group: string | null;
  sequence_index: number | null;
  music_context: MusicContext | null;
  metadata_status: string;
  notes?: string;
}

/**
 * Browse grouping, mirroring how Glassnik viewers browse videos.
 *
 * The viewer can browse Experiences by Location (for example "Kuala Lumpur"),
 * by Category (for example "Sports") or by Place (for example one shopping
 * mall). The music brief's core rule applies to whichever of the three is
 * active: music continues across every Experience inside the grouping and
 * changes when the grouping changes.
 */
export type GroupingType = 'location' | 'category' | 'place_type';

export interface GroupingFilter {
  type: GroupingType;
  /** Destination name, category id or place type id. */
  value: string;
}

export interface TaxonomyCategory {
  category_id: string;
  label: string;
}

export interface TaxonomyPlaceType {
  place_type: string;
  label: string;
}

export interface Taxonomy {
  schema_version: string;
  description: string;
  category_ids: TaxonomyCategory[];
  place_types: TaxonomyPlaceType[];
  notes?: string[];
}

/**
 * Why a track was selected. Precedence (highest first):
 * place_type_match -> category_match -> destination_match -> general_fallback.
 */
export type RecommendationReason =
  | 'place_type_match'
  | 'category_match'
  | 'destination_match'
  | 'general_fallback';

export type RecommendationMode = 'research' | 'production';

/**
 * An experience context groups consecutive videos that should share one
 * music decision. For records without a sequence_group the individual
 * experience id is the context.
 */
export interface RecommendationContext {
  /** Stable context key, e.g. a sequence_group or an experience id. */
  key: string;
  /** Human readable label for the diagnostics panel. */
  label: string;
  categoryId: string | null;
  placeType: string | null;
  destination: string | null;
  preferredMoods: string[];
  energyRange: [number, number] | null;
}

export interface Recommendation {
  contextKey: string;
  reason: RecommendationReason;
  /** Plain-language explanation of the decision. */
  explanation: string;
  track: Track | null;
  /** Field value that produced the match (e.g. "shopping"). */
  matchedValue: string | null;
  /** Catalogue field the match came from (e.g. "categories"). */
  matchedField: 'place_types' | 'categories' | 'destinations' | null;
  mode: RecommendationMode;
  /** Candidates in the winning tier before repetition avoidance. */
  tierCandidateCount: number;
  /** Structurally valid, playable and mode-eligible candidates. */
  eligibleCandidateCount: number;
  /** Candidate counts per precedence tier (before repetition avoidance). */
  tierCounts: Record<RecommendationReason, number>;
  /** True when the same track had to be reused because it was the only candidate. */
  repeatUnavoidable: boolean;
  /** Catalogue file_reference values whose audio file is missing on disk. */
  missingAudioFiles: string[];
  /** Track carries unverified/synthetic provenance labels from the catalogue. */
  unverified: boolean;
  /** Extra notes (e.g. production-mode filtering). */
  notes: string[];
}

export interface RecommendInput {
  context: RecommendationContext;
  tracks: Track[];
  mode: RecommendationMode;
  /** file_reference values (e.g. "audio/track-1.mp3") that exist on disk. */
  availableAudioFiles: string[];
  /** Track ids to avoid repeating when an alternative exists. */
  avoidTrackIds?: string[];
}

export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'blocked'
  | 'error';

export type ValidationLevel = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  /** Dotted path into the source document, e.g. "tracks[3].track_id". */
  path?: string;
  recordId?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
    categoryCount: number;
    placeTypeCount: number;
    experienceCount: number;
    trackCount: number;
    /** file_reference values with a file present under public/. */
    playableTrackCount: number;
    /** file_reference values referenced by the catalogue but missing on disk. */
    missingAudioFiles: string[];
    /** Tracks with approved_for_production === true (strict boolean). */
    productionApprovedCount: number;
    /** Tracks whose approved_for_production value is not a boolean. */
    invalidApprovalCount: number;
    /** Distinct SHA-256 checksums used by the catalogue. */
    uniqueChecksumCount: number;
    /** Catalogue entries that share their checksum with another entry. */
    duplicateChecksumCount: number;
    /** Tracks whose source URL has been confirmed by a human. */
    sourceUrlVerifiedCount: number;
    syntheticDataset: boolean;
  };
}
