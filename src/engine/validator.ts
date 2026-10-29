/**
 * Data validation for the Glassnik prototype.
 *
 * Validates the three real project documents against their actual schemas:
 *  - data/taxonomy.json
 *  - data/catalogue.json
 *  - data/sample_experiences.json
 *
 * Issue levels:
 *  - error   : the document contract is broken (missing/duplicate ids, wrong
 *              types, invalid approval values). The app can still boot and
 *              show diagnostics, but the data must be fixed.
 *  - warning : the app can continue (broken taxonomy references, audio files
 *              referenced but missing on disk, missing optional metadata).
 *  - info    : neutral findings (synthetic/unverified dataset labelling,
 *              absent video references, duplicate file usage).
 *
 * Optional fields are never rejected outright: their absence is reported at
 * the level that matches the schema (e.g. `destination: null` is info, not an
 * error).
 */
import type {
  SourceUrlStatus,
  ValidationIssue,
  ValidationResult,
} from '../types';

export interface ValidationInput {
  taxonomy: unknown;
  catalogue: unknown;
  experiences: unknown;
  /** file_reference values (relative to public/) that exist on disk. */
  availableAudioFiles: string[];
}

const REQUIRED_TRACK_FIELDS = ['track_id', 'title'] as const;
const TRACK_ARRAY_FIELDS = [
  'genres',
  'moods',
  'categories',
  'place_types',
  'destinations',
] as const;

const SOURCE_URL_STATUSES: SourceUrlStatus[] = [
  'candidate_unverified',
  'candidate_verified',
  'not_applicable',
];

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

class IssueCollector {
  readonly issues: ValidationIssue[] = [];

  add(issue: ValidationIssue): void {
    this.issues.push(issue);
  }

  error(code: string, message: string, path?: string, recordId?: string): void {
    this.add({ level: 'error', code, message, path, recordId });
  }

  warn(code: string, message: string, path?: string, recordId?: string): void {
    this.add({ level: 'warning', code, message, path, recordId });
  }

  info(code: string, message: string, path?: string, recordId?: string): void {
    this.add({ level: 'info', code, message, path, recordId });
  }
}

interface TaxonomyIndex {
  categoryIds: Set<string>;
  placeTypes: Set<string>;
}

function indexTaxonomy(doc: unknown, collector: IssueCollector): TaxonomyIndex {
  const index: TaxonomyIndex = { categoryIds: new Set(), placeTypes: new Set() };
  if (!isPlainObject(doc)) {
    collector.error('invalid_document', 'taxonomy.json must be a JSON object.', 'taxonomy');
    return index;
  }

  const checkEntries = (
    field: 'category_ids' | 'place_types',
    idKey: 'category_id' | 'place_type',
    target: Set<string>,
  ): void => {
    const entries = doc[field];
    if (!Array.isArray(entries)) {
      collector.error(
        'invalid_field_type',
        `taxonomy.${field} must be an array.`,
        `taxonomy.${field}`,
      );
      return;
    }
    entries.forEach((entry, i) => {
      const path = `taxonomy.${field}[${i}]`;
      if (!isPlainObject(entry)) {
        collector.error('invalid_field_type', `${path} must be an object.`, path);
        return;
      }
      const id = entry[idKey];
      if (typeof id !== 'string' || id.trim() === '') {
        collector.error(
          'missing_identifier',
          `${path}.${idKey} must be a non-empty string.`,
          `${path}.${idKey}`,
        );
        return;
      }
      if (target.has(id)) {
        collector.error(
          'duplicate_identifier',
          `Duplicate ${idKey} "${id}".`,
          `${path}.${idKey}`,
          id,
        );
      }
      target.add(id);
      if (typeof entry.label !== 'string' || entry.label.trim() === '') {
        collector.warn(
          'missing_metadata',
          `${path}.label is missing or empty.`,
          `${path}.label`,
          id,
        );
      }
    });
  };

  checkEntries('category_ids', 'category_id', index.categoryIds);
  checkEntries('place_types', 'place_type', index.placeTypes);
  return index;
}

function validateCatalogue(
  doc: unknown,
  taxonomy: TaxonomyIndex,
  availableAudioFiles: string[],
  collector: IssueCollector,
): { trackCount: number; destinations: Set<string>; sourceUrlVerified: number } {
  const destinations = new Set<string>();
  if (!isPlainObject(doc)) {
    collector.error('invalid_document', 'catalogue.json must be a JSON object.', 'catalogue');
    return { trackCount: 0, destinations, sourceUrlVerified: 0 };
  }

  const status = typeof doc.dataset_status === 'string' ? doc.dataset_status : '';
  if (status.includes('synthetic')) {
    collector.info(
      'synthetic_dataset',
      'Catalogue dataset_status marks this catalogue as a synthetic, unverified research scaffold.',
      'catalogue.dataset_status',
    );
  }

  const tracks = doc.tracks;
  if (!Array.isArray(tracks)) {
    collector.error('invalid_field_type', 'catalogue.tracks must be an array.', 'catalogue.tracks');
    return { trackCount: 0, destinations, sourceUrlVerified: 0 };
  }

  const seenIds = new Map<string, number>();
  const seenFiles = new Map<string, number>();
  const seenChecksums = new Map<string, number>();
  let productionApproved = 0;
  let invalidApprovals = 0;
  let playable = 0;
  let sourceUrlVerified = 0;
  const missingAudio: string[] = [];

  tracks.forEach((raw, i) => {
    const path = `catalogue.tracks[${i}]`;
    if (!isPlainObject(raw)) {
      collector.error('invalid_field_type', `${path} must be an object.`, path);
      return;
    }
    const recordId =
      typeof raw.track_id === 'string' && raw.track_id !== '' ? raw.track_id : undefined;

    for (const field of REQUIRED_TRACK_FIELDS) {
      const value = raw[field];
      if (typeof value !== 'string' || value.trim() === '') {
        collector.error(
          'missing_identifier',
          `${path}.${field} must be a non-empty string.`,
          `${path}.${field}`,
          recordId,
        );
      }
    }

    const trackId = typeof raw.track_id === 'string' ? raw.track_id : '';
    if (trackId !== '') {
      if (seenIds.has(trackId)) {
        collector.error(
          'duplicate_identifier',
          `Duplicate track_id "${trackId}" (first seen at index ${seenIds.get(trackId)}).`,
          `${path}.track_id`,
          trackId,
        );
      } else {
        seenIds.set(trackId, i);
      }
    }

    // Production approval must be a real boolean; missing is never approval.
    if (typeof raw.approved_for_production !== 'boolean') {
      invalidApprovals += 1;
      collector.error(
        'invalid_approval_value',
        `${path}.approved_for_production must be a boolean (got ${JSON.stringify(raw.approved_for_production)}). Missing approval is never treated as approval.`,
        `${path}.approved_for_production`,
        recordId,
      );
    } else if (raw.approved_for_production === true) {
      productionApproved += 1;
    }

    if (typeof raw.energy !== 'number' || Number.isNaN(raw.energy)) {
      collector.error(
        'invalid_field_type',
        `${path}.energy must be a number between 0.0 and 1.0.`,
        `${path}.energy`,
        recordId,
      );
    } else if (raw.energy < 0 || raw.energy > 1) {
      collector.warn(
        'out_of_range',
        `${path}.energy ${raw.energy} is outside 0.0–1.0.`,
        `${path}.energy`,
        recordId,
      );
    }

    for (const field of TRACK_ARRAY_FIELDS) {
      const value = raw[field];
      if (value === undefined || value === null) {
        collector.warn(
          'missing_metadata',
          `${path}.${field} is missing.`,
          `${path}.${field}`,
          recordId,
        );
        continue;
      }
      if (!isStringArray(value)) {
        collector.error(
          'invalid_field_type',
          `${path}.${field} must be an array of strings.`,
          `${path}.${field}`,
          recordId,
        );
        continue;
      }
      if (field === 'categories') {
        value.forEach((id) => {
          if (!taxonomy.categoryIds.has(id)) {
            collector.warn(
              'broken_taxonomy_reference',
              `${path}: category "${id}" does not exist in taxonomy.category_ids.`,
              `${path}.categories`,
              recordId,
            );
          }
        });
      }
      if (field === 'place_types') {
        value.forEach((id) => {
          if (!taxonomy.placeTypes.has(id)) {
            collector.warn(
              'broken_taxonomy_reference',
              `${path}: place type "${id}" does not exist in taxonomy.place_types.`,
              `${path}.place_types`,
              recordId,
            );
          }
        });
      }
      if (field === 'destinations') {
        value.forEach((d) => destinations.add(d));
      }
    }

    const fileRef = raw.file_reference;
    if (fileRef !== null && fileRef !== undefined && typeof fileRef !== 'string') {
      collector.error(
        'invalid_field_type',
        `${path}.file_reference must be a string or null.`,
        `${path}.file_reference`,
        recordId,
      );
    } else if (typeof fileRef === 'string' && fileRef !== '') {
      if (seenFiles.has(fileRef)) {
        collector.warn(
          'duplicate_reference',
          `${path}: file_reference "${fileRef}" is also used by track index ${seenFiles.get(fileRef)}.`,
          `${path}.file_reference`,
          recordId,
        );
      } else {
        seenFiles.set(fileRef, i);
      }
      if (availableAudioFiles.includes(fileRef)) {
        playable += 1;
      } else {
        missingAudio.push(fileRef);
        collector.warn(
          'missing_audio_file',
          `${path}: file_reference "${fileRef}" has no file under public/ and cannot be played.`,
          `${path}.file_reference`,
          recordId,
        );
      }
    } else if (fileRef === null || fileRef === undefined) {
      collector.info(
        'no_file_reference',
        `${path}: no file_reference; the track is metadata-only and not playable.`,
        `${path}.file_reference`,
        recordId,
      );
    }

    if (raw.review_status === 'rejected' && raw.approved_for_production === true) {
      collector.error(
        'invalid_approval_value',
        `${path} is approved_for_production but review_status is "rejected".`,
        `${path}.review_status`,
        recordId,
      );
    }

    if (raw.provenance === undefined || raw.provenance === null) {
      collector.warn('missing_metadata', `${path}.provenance is missing.`, `${path}.provenance`, recordId);
    }

    // --- source URL honesty -------------------------------------------
    const sourceStatus = raw.source_url_status;
    if (sourceStatus === undefined || sourceStatus === null) {
      collector.warn(
        'missing_metadata',
        `${path}.source_url_status is missing; the source URL must not be treated as confirmed.`,
        `${path}.source_url_status`,
        recordId,
      );
    } else if (
      typeof sourceStatus !== 'string' ||
      !SOURCE_URL_STATUSES.includes(sourceStatus as SourceUrlStatus)
    ) {
      collector.error(
        'invalid_field_type',
        `${path}.source_url_status must be one of ${SOURCE_URL_STATUSES.join(', ')} (got ${JSON.stringify(sourceStatus)}).`,
        `${path}.source_url_status`,
        recordId,
      );
    } else if (sourceStatus === 'candidate_verified') {
      sourceUrlVerified += 1;
    }

    if (typeof raw.source_url === 'string' && raw.source_url !== '') {
      if (!raw.source_url.startsWith('https://')) {
        collector.error(
          'invalid_source_url',
          `${path}.source_url must be an https URL (got ${JSON.stringify(raw.source_url)}).`,
          `${path}.source_url`,
          recordId,
        );
      }
    }

    if (typeof raw.source_search_url === 'string' && raw.source_search_url !== '') {
      if (!raw.source_search_url.startsWith('https://')) {
        collector.error(
          'invalid_source_url',
          `${path}.source_search_url must be an https URL (got ${JSON.stringify(raw.source_search_url)}).`,
          `${path}.source_search_url`,
          recordId,
        );
      }
    }

    // --- checksum and duration ----------------------------------------
    const checksum = raw.checksum;
    if (checksum === undefined || checksum === null) {
      collector.warn(
        'missing_metadata',
        `${path}.checksum is missing; the audio file cannot be checked for duplicates.`,
        `${path}.checksum`,
        recordId,
      );
    } else if (typeof checksum !== 'string' || !SHA256_PATTERN.test(checksum)) {
      collector.error(
        'invalid_checksum',
        `${path}.checksum must be a 64 character lowercase SHA-256 hex string.`,
        `${path}.checksum`,
        recordId,
      );
    } else {
      const previous = seenChecksums.get(checksum);
      if (previous !== undefined) {
        collector.error(
          'duplicate_checksum',
          `${path}: checksum "${checksum}" is already used by track index ${previous}; two catalogue entries point at the same audio.`,
          `${path}.checksum`,
          recordId,
        );
      } else {
        seenChecksums.set(checksum, i);
      }
    }

    const duration = raw.duration_seconds;
    if (duration !== undefined && duration !== null) {
      if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
        collector.error(
          'invalid_field_type',
          `${path}.duration_seconds must be a positive number of seconds.`,
          `${path}.duration_seconds`,
          recordId,
        );
      }
    }
  });

  const declaredTotal = isPlainObject(doc.counts) ? doc.counts.total : undefined;
  if (typeof declaredTotal === 'number' && declaredTotal !== tracks.length) {
    collector.warn(
      'inconsistent_count',
      `catalogue.counts.total is ${declaredTotal} but tracks contains ${tracks.length} records.`,
      'catalogue.counts.total',
    );
  }

  collector.info(
    'summary',
    `Catalogue: ${tracks.length} tracks, ${playable} playable, ${productionApproved} approved for production, ${invalidApprovals} invalid approval value(s).`,
    'catalogue.tracks',
  );

  return { trackCount: tracks.length, destinations, sourceUrlVerified };
}

function validateExperiences(
  doc: unknown,
  taxonomy: TaxonomyIndex,
  catalogueDestinations: Set<string>,
  collector: IssueCollector,
): number {
  if (!isPlainObject(doc)) {
    collector.error(
      'invalid_document',
      'sample_experiences.json must be a JSON object.',
      'experiences',
    );
    return 0;
  }
  const list = doc.experiences;
  if (!Array.isArray(list)) {
    collector.error(
      'invalid_field_type',
      'experiences must be an array.',
      'experiences.experiences',
    );
    return 0;
  }

  const seenIds = new Map<string, number>();
  const seenSequence = new Map<string, number>();
  let withoutVideo = 0;

  list.forEach((raw, i) => {
    const path = `experiences[${i}]`;
    if (!isPlainObject(raw)) {
      collector.error('invalid_field_type', `${path} must be an object.`, path);
      return;
    }
    const recordId =
      typeof raw.experience_id === 'string' && raw.experience_id !== ''
        ? raw.experience_id
        : undefined;

    if (typeof raw.experience_id !== 'string' || raw.experience_id.trim() === '') {
      collector.error(
        'missing_identifier',
        `${path}.experience_id must be a non-empty string.`,
        `${path}.experience_id`,
      );
    } else if (seenIds.has(raw.experience_id)) {
      collector.error(
        'duplicate_identifier',
        `Duplicate experience_id "${raw.experience_id}" (first seen at index ${seenIds.get(raw.experience_id)}).`,
        `${path}.experience_id`,
        raw.experience_id,
      );
    } else {
      seenIds.set(raw.experience_id, i);
    }

    if (typeof raw.title !== 'string' || raw.title.trim() === '') {
      collector.error(
        'missing_required_field',
        `${path}.title must be a non-empty string.`,
        `${path}.title`,
        recordId,
      );
    }

    const categoryId = raw.category_id;
    if (categoryId === null || categoryId === undefined) {
      collector.warn(
        'missing_metadata',
        `${path}.category_id is null; the recommendation falls back to place type, destination or the general pool.`,
        `${path}.category_id`,
        recordId,
      );
    } else if (typeof categoryId !== 'string') {
      collector.error(
        'invalid_field_type',
        `${path}.category_id must be a string or null.`,
        `${path}.category_id`,
        recordId,
      );
    } else if (!taxonomy.categoryIds.has(categoryId)) {
      collector.warn(
        'broken_taxonomy_reference',
        `${path}: category_id "${categoryId}" does not exist in taxonomy.category_ids.`,
        `${path}.category_id`,
        recordId,
      );
    }

    const placeType = raw.place_type;
    if (placeType === null || placeType === undefined) {
      collector.warn(
        'missing_metadata',
        `${path}.place_type is null.`,
        `${path}.place_type`,
        recordId,
      );
    } else if (typeof placeType !== 'string') {
      collector.error(
        'invalid_field_type',
        `${path}.place_type must be a string or null.`,
        `${path}.place_type`,
        recordId,
      );
    } else if (!taxonomy.placeTypes.has(placeType)) {
      collector.warn(
        'broken_taxonomy_reference',
        `${path}: place_type "${placeType}" does not exist in taxonomy.place_types.`,
        `${path}.place_type`,
        recordId,
      );
    }

    const destination = raw.destination;
    if (destination === null || destination === undefined) {
      collector.warn(
        'missing_metadata',
        `${path}.destination is null.`,
        `${path}.destination`,
        recordId,
      );
    } else if (typeof destination !== 'string') {
      collector.error(
        'invalid_field_type',
        `${path}.destination must be a string or null.`,
        `${path}.destination`,
        recordId,
      );
    } else if (catalogueDestinations.size > 0 && !catalogueDestinations.has(destination)) {
      collector.warn(
        'broken_catalogue_reference',
        `${path}: destination "${destination}" does not appear in any catalogue destinations array, so destination matching cannot succeed.`,
        `${path}.destination`,
        recordId,
      );
    }

    if (raw.video_reference === null || raw.video_reference === undefined) {
      withoutVideo += 1;
    }

    if (raw.sequence_group !== null && raw.sequence_group !== undefined) {
      const indexValue = raw.sequence_index;
      if (typeof indexValue !== 'number') {
        collector.warn(
          'missing_metadata',
          `${path}: sequence_group is set but sequence_index is not a number.`,
          `${path}.sequence_index`,
          recordId,
        );
      } else {
        const key = `${String(raw.sequence_group)}#${indexValue}`;
        if (seenSequence.has(key)) {
          collector.warn(
            'duplicate_sequence_index',
            `${path}: sequence "${String(raw.sequence_group)}" index ${indexValue} is used more than once.`,
            `${path}.sequence_index`,
            recordId,
          );
        } else {
          seenSequence.set(key, i);
        }
      }
    }

    if (raw.music_context !== null && raw.music_context !== undefined) {
      if (!isPlainObject(raw.music_context)) {
        collector.error(
          'invalid_field_type',
          `${path}.music_context must be an object or null.`,
          `${path}.music_context`,
          recordId,
        );
      } else {
        const range = raw.music_context.energy_range;
        if (
          range !== undefined &&
          !(
            Array.isArray(range) &&
            range.length === 2 &&
            range.every((v) => typeof v === 'number')
          )
        ) {
          collector.error(
            'invalid_field_type',
            `${path}.music_context.energy_range must be a [number, number] pair.`,
            `${path}.music_context.energy_range`,
            recordId,
          );
        }
      }
    }
  });

  if (withoutVideo > 0) {
    collector.info(
      'no_video_reference',
      `${withoutVideo} experience record(s) have no video_reference; the UI simulates video changes instead of playing video.`,
      'experiences',
    );
  }

  const syntheticCount = list.filter(
    (e) => isPlainObject(e) && e.metadata_status === 'synthetic_test_record',
  ).length;
  if (syntheticCount > 0) {
    collector.info(
      'synthetic_data',
      `${syntheticCount} experience record(s) are labelled synthetic_test_record and must not be presented as verified research.`,
      'experiences',
    );
  }

  return list.length;
}

/**
 * Validates taxonomy, catalogue and sample experiences together.
 * Never throws: every problem is reported as an issue.
 */
export function validateAll(input: ValidationInput): ValidationResult {
  const collector = new IssueCollector();

  const taxonomy = indexTaxonomy(input.taxonomy, collector);
  const catalogue = validateCatalogue(
    input.catalogue,
    taxonomy,
    input.availableAudioFiles,
    collector,
  );
  const experienceCount = validateExperiences(
    input.experiences,
    taxonomy,
    catalogue.destinations,
    collector,
  );

  if (taxonomy.categoryIds.size === 0 || taxonomy.placeTypes.size === 0) {
    collector.error(
      'invalid_document',
      'Taxonomy contains no usable category or place type entries.',
      'taxonomy',
    );
  }

  const issueWithLevel = (level: ValidationIssue['level']) =>
    collector.issues.filter((i) => i.level === level).length;

  const doc = isPlainObject(input.catalogue) ? input.catalogue : {};
  const tracks = Array.isArray(doc.tracks) ? doc.tracks : [];
  const playableCount = tracks.filter(
    (t) =>
      isPlainObject(t) &&
      typeof t.file_reference === 'string' &&
      input.availableAudioFiles.includes(t.file_reference),
  ).length;
  const missingAudioFiles = tracks
    .filter(
      (t) =>
        isPlainObject(t) &&
        typeof t.file_reference === 'string' &&
        t.file_reference !== '' &&
        !input.availableAudioFiles.includes(t.file_reference),
    )
    .map((t) => String((t as { file_reference: unknown }).file_reference));
  const productionApprovedCount = tracks.filter(
    (t) => isPlainObject(t) && t.approved_for_production === true,
  ).length;
  const invalidApprovalCount = tracks.filter(
    (t) => isPlainObject(t) && typeof t.approved_for_production !== 'boolean',
  ).length;
  const checksums = tracks
    .filter((t) => isPlainObject(t) && typeof t.checksum === 'string' && t.checksum !== '')
    .map((t) => String((t as { checksum: unknown }).checksum));
  const uniqueChecksumCount = new Set(checksums).size;
  const duplicateChecksumCount = checksums.length - uniqueChecksumCount;

  const errorCount = issueWithLevel('error');
  return {
    ok: errorCount === 0,
    issues: collector.issues,
    summary: {
      errorCount,
      warningCount: issueWithLevel('warning'),
      infoCount: issueWithLevel('info'),
      categoryCount: taxonomy.categoryIds.size,
      placeTypeCount: taxonomy.placeTypes.size,
      experienceCount,
      trackCount: tracks.length,
      playableTrackCount: playableCount,
      missingAudioFiles,
      productionApprovedCount,
      invalidApprovalCount,
      /** Distinct SHA-256 checksums used by the catalogue. */
      uniqueChecksumCount,
      /** Catalogue entries that share their checksum with another entry. */
      duplicateChecksumCount,
      /** Tracks whose source URL has been confirmed by a human. */
      sourceUrlVerifiedCount: catalogue.sourceUrlVerified,
      syntheticDataset:
        isPlainObject(doc) && String(doc.dataset_status ?? '').includes('synthetic'),
    },
  };
}
