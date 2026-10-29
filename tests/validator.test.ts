/**
 * Validator tests.
 *
 * The first block runs the validator against the real project documents.
 * The remaining blocks feed deliberately broken fixtures to prove each class
 * of problem is detected.
 */
import { describe, expect, it } from 'vitest';
import { AVAILABLE_AUDIO_FILES } from '../src/audioManifest';
import { experiences, taxonomyData, tracks } from '../src/data/dataset';
import { validateAll } from '../src/engine/validator';

function realInput() {
  return {
    taxonomy: taxonomyData,
    catalogue: { dataset_status: 'synthetic_research_scaffold_not_verified_pixabay_catalogue', tracks },
    experiences: { experiences },
    availableAudioFiles: AVAILABLE_AUDIO_FILES,
  };
}

function codesFor(result: ReturnType<typeof validateAll>, level?: string): string[] {
  return result.issues
    .filter((i) => (level ? i.level === level : true))
    .map((i) => i.code);
}

describe('valid project data', () => {
  it('accepts the real JSON documents without errors', () => {
    const result = validateAll(realInput());
    expect(result.summary.errorCount).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.summary.trackCount).toBe(59);
    expect(result.summary.experienceCount).toBe(15);
    expect(result.summary.categoryCount).toBe(21);
    expect(result.summary.placeTypeCount).toBe(15);
    expect(result.summary.playableTrackCount).toBe(59);
    expect(result.summary.syntheticDataset).toBe(true);
  });

  it('finds every catalogue audio reference present on disk', () => {
    const result = validateAll(realInput());
    expect(result.summary.missingAudioFiles).toEqual([]);
    const missing = result.issues.filter((i) => i.code === 'missing_audio_file');
    expect(missing).toHaveLength(0);
  });

  it('still reports a reference that is genuinely missing', () => {
    const brokenTrack = {
      ...tracks[0],
      track_id: 'fx-missing-file',
      file_reference: 'audio/track-999.mp3',
    };
    const result = validateAll({
      ...realInput(),
      catalogue: { dataset_status: realInput().catalogue.dataset_status, tracks: [brokenTrack] },
    });
    const missing = result.issues.filter((i) => i.code === 'missing_audio_file');
    expect(missing).toHaveLength(1);
    expect(missing[0].level).toBe('warning');
    expect(missing[0].message).toContain('audio/track-999.mp3');
  });

  it('labels synthetic data as information, not as an error', () => {
    const result = validateAll(realInput());
    expect(codesFor(result, 'error')).not.toContain('synthetic_dataset');
    expect(codesFor(result, 'info')).toContain('synthetic_dataset');
    expect(codesFor(result, 'info')).toContain('synthetic_data');
  });

  it('reports production approval counts honestly', () => {
    const result = validateAll(realInput());
    expect(result.summary.productionApprovedCount).toBe(59);
    expect(result.summary.invalidApprovalCount).toBe(0);
  });

  it('reports the checksum situation honestly', () => {
    const result = validateAll(realInput());
    // Every one of the 59 tracks has its own audio file.
    expect(result.summary.uniqueChecksumCount).toBe(59);
    expect(result.summary.duplicateChecksumCount).toBe(0);
    expect(codesFor(result, 'error')).not.toContain('duplicate_checksum');
  });

  it('reports source URLs that were never verified', () => {
    const result = validateAll(realInput());
    // No human has opened the candidate Pixabay Music pages yet.
    expect(result.summary.sourceUrlVerifiedCount).toBe(0);
    expect(codesFor(result, 'error')).not.toContain('invalid_source_url');
  });
});

describe('invalid JSON structures', () => {
  it('reports a non-object catalogue document', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: 'not an object',
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(result.ok).toBe(false);
    expect(codesFor(result, 'error')).toContain('invalid_document');
  });

  it('reports catalogue.tracks that is not an array', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: { tracks: { nope: true } },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'error')).toContain('invalid_field_type');
  });

  it('reports wrong field types on individual tracks', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [
          {
            track_id: 't-1',
            title: 'Broken',
            energy: 'loud',
            categories: 'shopping',
            approved_for_production: false,
          },
        ],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    const errors = result.issues.filter((i) => i.level === 'error');
    expect(errors.some((i) => i.code === 'invalid_field_type')).toBe(true);
    expect(result.ok).toBe(false);
  });
});

describe('missing identifiers and broken references', () => {
  it('detects a missing track_id', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: { tracks: [{ title: 'No id', approved_for_production: false }] },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'error')).toContain('missing_identifier');
  });

  it('detects duplicate track_ids', () => {
    const duplicate = {
      track_id: 'dup-1',
      title: 'A',
      approved_for_production: false,
      categories: [],
      place_types: [],
      destinations: [],
      energy: 0.5,
    };
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: { tracks: [duplicate, { ...duplicate, title: 'B' }] },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'error')).toContain('duplicate_identifier');
  });

  it('detects duplicate experience ids', () => {
    const exp = {
      experience_id: 'dup-exp',
      title: 'Duplicate',
      category_id: 'shopping',
      place_type: null,
      destination: null,
      video_reference: null,
      sequence_group: null,
      sequence_index: null,
      music_context: null,
      metadata_status: 'synthetic_test_record',
    };
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: { tracks: [] },
      experiences: { experiences: [exp, { ...exp, title: 'Copy' }] },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'error')).toContain('duplicate_identifier');
  });

  it('detects taxonomy references that do not exist', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [
          {
            track_id: 't-ref',
            title: 'Ref',
            categories: ['underwater basket weaving'],
            place_types: ['moon_base'],
            destinations: [],
            energy: 0.5,
            approved_for_production: false,
          },
        ],
      },
      experiences: { experiences: [] },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    const warnings = result.issues.filter(
      (i) => i.code === 'broken_taxonomy_reference',
    );
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.every((i) => i.level === 'warning')).toBe(true);
  });

  it('detects an experience whose category is not in the taxonomy', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: { tracks: [] },
      experiences: {
        experiences: [
          {
            experience_id: 'exp-bad-ref',
            title: 'Bad reference',
            category_id: 'time_travel',
            place_type: 'shopping_mall',
            destination: 'Kuala Lumpur',
            video_reference: null,
            sequence_group: null,
            sequence_index: null,
            music_context: null,
            metadata_status: 'synthetic_test_record',
          },
        ],
      },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'warning')).toContain('broken_taxonomy_reference');
  });

  it('detects an experience destination that no catalogue track references', () => {
    const experienceFixture = {
      experience_id: 'exp-atlantis',
      title: 'Atlantis dive',
      category_id: 'walking',
      place_type: null,
      destination: 'Atlantis',
      video_reference: null,
      sequence_group: null,
      sequence_index: null,
      music_context: null,
      metadata_status: 'synthetic_test_record',
    };
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [
          {
            track_id: 't-1',
            title: 'A',
            categories: [],
            place_types: [],
            destinations: ['Kuala Lumpur'],
            energy: 0.5,
            approved_for_production: false,
          },
        ],
      },
      experiences: { experiences: [experienceFixture] },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'warning')).toContain('broken_catalogue_reference');
  });
});

describe('missing audio references', () => {
  it('warns when a file_reference has no file on disk', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [
          {
            track_id: 't-missing',
            title: 'Missing file',
            file_reference: 'audio/track-404.mp3',
            categories: [],
            place_types: [],
            destinations: [],
            energy: 0.5,
            approved_for_production: false,
          },
        ],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    const issue = result.issues.find((i) => i.code === 'missing_audio_file');
    expect(issue).toBeDefined();
    expect(issue?.level).toBe('warning');
    expect(issue?.message).toContain('audio/track-404.mp3');
    expect(result.summary.playableTrackCount).toBe(0);
  });

  it('flags duplicate file references across tracks', () => {
    const base = {
      title: 'Same file',
      file_reference: 'audio/track-1.mp3',
      categories: [],
      place_types: [],
      destinations: [],
      energy: 0.5,
      approved_for_production: false,
    };
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [
          { ...base, track_id: 'dup-file-1' },
          { ...base, track_id: 'dup-file-2' },
        ],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'warning')).toContain('duplicate_reference');
  });
});

describe('invalid approval values', () => {
  it('rejects a non-boolean approved_for_production', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [
          {
            track_id: 't-approval',
            title: 'Bad approval',
            categories: [],
            place_types: [],
            destinations: [],
            energy: 0.4,
            approved_for_production: 'yes',
          },
        ],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    const issue = result.issues.find((i) => i.code === 'invalid_approval_value');
    expect(issue).toBeDefined();
    expect(issue?.level).toBe('error');
    expect(result.ok).toBe(false);
    expect(result.summary.invalidApprovalCount).toBe(1);
  });

  it('rejects a missing approved_for_production field', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [{ track_id: 't-none', title: 'No approval field', categories: [], place_types: [], destinations: [], energy: 0.3 }],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'error')).toContain('invalid_approval_value');
  });
});

describe('checksums, durations and source URLs', () => {
  const base = {
    title: 'Fixture',
    file_reference: 'audio/track-1.mp3',
    categories: [],
    place_types: [],
    destinations: [],
    energy: 0.5,
    approved_for_production: false,
    source_url_status: 'candidate_unverified',
    source_search_url: 'https://pixabay.com/music/search/ambient/',
  };

  it('rejects a checksum that is not a SHA-256 hash', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [{ ...base, track_id: 't-sum', checksum: 'not-a-hash' }],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'error')).toContain('invalid_checksum');
    expect(result.ok).toBe(false);
  });

  it('rejects two tracks that point at the same audio', () => {
    const checksum = 'a'.repeat(64);
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [
          { ...base, track_id: 't-sum-1', checksum },
          { ...base, track_id: 't-sum-2', checksum },
        ],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'error')).toContain('duplicate_checksum');
    expect(result.summary.duplicateChecksumCount).toBe(1);
    expect(result.summary.uniqueChecksumCount).toBe(1);
  });

  it('rejects a duration that is not a positive number of seconds', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [{ ...base, track_id: 't-dur', duration_seconds: 0 }],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'error')).toContain('invalid_field_type');
  });

  it('rejects a source URL that is not https', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [
          {
            ...base,
            track_id: 't-src',
            source_url: 'http://pixabay.com/music/some-track-1/',
          },
        ],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'error')).toContain('invalid_source_url');
  });

  it('rejects an unknown source URL status', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [{ ...base, track_id: 't-status', source_url_status: 'probably_fine' }],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(codesFor(result, 'error')).toContain('invalid_field_type');
  });

  it('counts the source URLs that a human has confirmed', () => {
    const result = validateAll({
      taxonomy: taxonomyData,
      catalogue: {
        tracks: [
          { ...base, track_id: 't-verified-1', source_url_status: 'candidate_verified' },
          { ...base, track_id: 't-verified-2', source_url_status: 'candidate_verified' },
          { ...base, track_id: 't-unverified', source_url_status: 'candidate_unverified' },
        ],
      },
      experiences: { experiences },
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(result.summary.sourceUrlVerifiedCount).toBe(2);
  });
});
