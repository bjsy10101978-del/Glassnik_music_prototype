/**
 * Recommendation engine tests.
 *
 * These run against the real project data (data/catalogue.json,
 * data/taxonomy.json, data/sample_experiences.json) plus small synthetic
 * fixtures where a specific precedence rule needs isolating.
 *
 * The anti-stereotype tests assert that track choice comes from documented
 * metadata fields: destination strings are only compared literally, and no
 * city/city-to-genre mapping exists, so Tokyo cannot select "traditional
 * Japanese music" and Paris cannot select "accordion music".
 */
import { describe, expect, it } from 'vitest';
import { AVAILABLE_AUDIO_FILES } from '../src/audioManifest';
import { experiences, tracks } from '../src/data/dataset';
import {
  buildContext,
  recommend,
  resolveContextKey,
  resolveContextSource,
} from '../src/engine/recommender';
import type { Experience, RecommendInput, Track } from '../src/types';

function inputFor(
  experienceId: string,
  overrides: Partial<RecommendInput> = {},
): RecommendInput {
  const experience = experiences.find((e) => e.experience_id === experienceId);
  if (!experience) throw new Error(`Missing fixture experience ${experienceId}`);
  return {
    context: buildContext(experience),
    tracks,
    mode: 'research',
    availableAudioFiles: AVAILABLE_AUDIO_FILES,
    ...overrides,
  };
}

function experience(id: string): Experience {
  const found = experiences.find((e) => e.experience_id === id);
  if (!found) throw new Error(`Missing fixture experience ${id}`);
  return found;
}

describe('Kuala Lumpur shopping sequence', () => {
  it('selects music from category/destination metadata, not stereotypes', () => {
    const result = recommend(inputFor('exp-kl-shopping-01'));
    expect(result.track).not.toBeNull();
    // Chosen because the catalogue pools it under the trip's category: the
    // "shopping" category owns its own disjoint set of tracks.
    expect(result.reason).toBe('category_match');
    expect(result.matchedField).toBe('categories');
    expect(result.matchedValue).toBe('shopping');
    expect(result.track?.categories).toContain('shopping');
    expect(result.track?.track_id).toBe('glassnik-006');
  });

  it('consecutive videos in the same experience keep the same recommendation context', () => {
    const sequenceIds = [
      'exp-kl-shopping-01',
      'exp-kl-shopping-02',
      'exp-kl-shopping-03',
      'exp-kl-shopping-04',
      'exp-kl-shopping-05',
    ];
    const keys = sequenceIds.map((id) => resolveContextKey(experience(id)));
    // One shared context key for the whole sequence.
    expect(new Set(keys).size).toBe(1);

    // A trip makes ONE music decision, so the context comes from the first
    // video of the sequence - not from the video the user happens to watch.
    const representative = resolveContextSource(
      experience('exp-kl-shopping-03'),
      experiences,
    );
    expect(representative.experience_id).toBe('exp-kl-shopping-01');

    const results = sequenceIds.map((id) =>
      recommend(inputFor(id, { context: buildContext(representative) })),
    );
    const trackIds = new Set(results.map((r) => r.track?.track_id));
    expect(trackIds.size).toBe(1);
    expect(results.every((r) => r.contextKey === keys[0])).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    const a = recommend(inputFor('exp-kl-shopping-02'));
    const b = recommend(inputFor('exp-kl-shopping-02'));
    expect(a).toEqual(b);
  });
});

describe('Beach context', () => {
  it('Phu Quoc beach follows beach-related catalogue metadata', () => {
    const result = recommend(inputFor('exp-phu-quoc-beach'));
    expect(result.reason).toBe('category_match');
    expect(result.track?.categories).toContain('beaches');
    expect(result.matchedValue).toBe('beaches');
    expect(result.track?.track_id).toBe('glassnik-002');
  });
});

describe('Anti-stereotype rules', () => {
  it('Tokyo shopping does not select traditional Japanese music', () => {
    for (const mode of ['research', 'production'] as const) {
      const result = recommend(inputFor('exp-tokyo-shopping', { mode }));
      expect(result.track).not.toBeNull();
      const genreBlob = (result.track?.genres ?? []).join(' ').toLowerCase();
      expect(genreBlob).not.toMatch(
        /traditional|folk|gagaku|shamisen|koto|enka|taiko|minyo|japanese/,
      );
      // Selection is explained by documented metadata, not by the city name.
      expect([
        'place_type_match',
        'category_match',
        'destination_match',
        'general_fallback',
      ]).toContain(result.reason);
    }
  });

  it('Paris historic street does not select accordion music', () => {
    for (const mode of ['research', 'production'] as const) {
      const result = recommend(inputFor('exp-paris-historic', { mode }));
      expect(result.track).not.toBeNull();
      const genreBlob = (result.track?.genres ?? []).join(' ').toLowerCase();
      expect(genreBlob).not.toMatch(/accordion|musette|chanson|french/);
    }
    const research = recommend(inputFor('exp-paris-historic'));
    // The trip's category pool ("walking") supplies the track; the
    // destination string carries no meaning on its own.
    expect(research.reason).toBe('category_match');
    expect(research.track?.categories).toContain('walking');
  });

  it('never maps destinations to genres anywhere in the engine output', () => {
    // Every experience resolves through one of the four documented reasons.
    for (const exp of experiences) {
      const result = recommend(inputFor(exp.experience_id));
      expect([
        'place_type_match',
        'category_match',
        'destination_match',
        'general_fallback',
      ]).toContain(result.reason);
    }
  });
});

describe('Fallback behaviour', () => {
  it('unknown category triggers an appropriate general fallback', () => {
    const result = recommend({
      context: {
        key: 'test-unknown-category',
        label: 'unknown category fixture',
        categoryId: 'hot_air_balloon_rides',
        placeType: null,
        destination: null,
        preferredMoods: [],
        energyRange: null,
      },
      tracks,
      mode: 'research',
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(result.reason).toBe('general_fallback');
    expect(result.explanation).toMatch(/general fallback/i);
    expect(result.track).not.toBeNull();
    expect(result.tierCounts.category_match).toBe(0);
    expect(result.tierCounts.place_type_match).toBe(0);
    expect(result.tierCounts.destination_match).toBe(0);
  });

  it('category beats place type beats destination when all match (fixture)', () => {
    const makeTrack = (overrides: Partial<Track>): Track => ({
      track_id: 'fx-1',
      title: 'Fixture',
      artist: 'Fixture Artist',
      source_url: null,
      source_url_status: 'not_applicable',
      source_search_url: null,
      file_reference: 'audio/track-1.mp3',
      checksum: null,
      duration_seconds: null,
      genres: ['ambient'],
      moods: [],
      vocals: 'instrumental',
      energy: 0.5,
      bpm: 80,
      categories: [],
      place_types: [],
      destinations: [],
      provenance: { status: 'fixture', note: 'unit test fixture' },
      licence_source: null,
      content_id_flag: 'not_applicable',
      review_status: 'metadata_reviewed',
      approved_for_production: true,
      ...overrides,
    });

    const tracksFixture: Track[] = [
      makeTrack({ track_id: 'fx-cat', categories: ['shopping'] }),
      makeTrack({ track_id: 'fx-dest', destinations: ['Kuala Lumpur'] }),
      makeTrack({ track_id: 'fx-place', place_types: ['city_centre'] }),
    ];

    const result = recommend({
      context: {
        key: 'fx-context',
        label: 'fixture',
        categoryId: 'shopping',
        placeType: 'city_centre',
        destination: 'Kuala Lumpur',
        preferredMoods: [],
        energyRange: null,
      },
      tracks: tracksFixture,
      mode: 'research',
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });

    // Category comes first: a context with a category is served by its own
    // category pool even when place types would also match.
    expect(result.reason).toBe('category_match');
    expect(result.track?.track_id).toBe('fx-cat');
    expect(result.tierCounts).toEqual({
      category_match: 1,
      place_type_match: 1,
      destination_match: 1,
      general_fallback: 3,
    });
  });
});

describe('Modes', () => {
  it('production mode never selects entries without explicit approval', () => {
    for (const exp of experiences) {
      const result = recommend(inputFor(exp.experience_id, { mode: 'production' }));
      if (result.track) {
        expect(result.track.approved_for_production).toBe(true);
      }
    }
  });

  it('research mode may select unapproved entries, production mode may not', () => {
    // Fixture: one unapproved and one approved track sharing a category.
    // All library recordings are pool-backed and production-eligible, so the
    // difference between the modes is isolated on synthetic data.
    const base = {
      ...tracks[0],
      categories: ['mountain'],
      place_types: [],
      destinations: [],
    } as unknown as Track;
    const unapproved = { ...base, track_id: 'fx-a-unapproved', approved_for_production: false };
    const approved = { ...base, track_id: 'fx-approved', approved_for_production: true };
    const context = {
      key: 'fx-modes',
      label: 'modes fixture',
      categoryId: 'mountain',
      placeType: null,
      destination: null,
      preferredMoods: [],
      energyRange: null,
    };
    const recommendWith = (mode: 'research' | 'production') =>
      recommend({
        context,
        tracks: [unapproved, approved],
        mode,
        availableAudioFiles: AVAILABLE_AUDIO_FILES,
      });

    const research = recommendWith('research');
    expect(research.track?.track_id).toBe('fx-a-unapproved');
    expect(research.track?.approved_for_production).toBe(false);

    const production = recommendWith('production');
    // Production mode only allows approved entries.
    expect(production.track?.track_id).toBe('fx-approved');
    expect(production.track?.approved_for_production).toBe(true);
    expect(production.notes.some((n) => n.includes('Production mode'))).toBe(true);
  });

  it('missing approval (non-boolean) is never treated as approval', () => {
    const trackWithMissingApproval = {
      ...tracks[0],
      track_id: 'fx-missing-approval',
      approved_for_production: 'true', // wrong type on purpose
    } as unknown as Track;

    const production = recommend({
      context: buildContext(experience('exp-kl-shopping-01')),
      tracks: [trackWithMissingApproval],
      mode: 'production',
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(production.track).toBeNull();
  });
});

describe('Missing audio files', () => {
  it('lists every catalogue reference that resolves to a real file', () => {
    // All ten referenced files exist now: track-1 .. track-10.
    expect(AVAILABLE_AUDIO_FILES).toContain('audio/track-9.mp3');
    expect(AVAILABLE_AUDIO_FILES).toContain('audio/track-10.mp3');

    const result = recommend(inputFor('exp-missing-category'));
    expect(result.track).not.toBeNull();
    expect(AVAILABLE_AUDIO_FILES).toContain(result.track?.file_reference);
    expect(result.missingAudioFiles).toEqual([]);
  });

  it('still excludes a reference whose file is genuinely absent', () => {
    // Simulate a catalogue entry pointing at a file that does not exist.
    const missingTrack = {
      ...tracks[0],
      track_id: 'fx-missing-file',
      categories: ['shopping'],
      place_types: [],
      destinations: [],
      file_reference: 'audio/track-404.mp3',
    } as unknown as Track;

    const result = recommend({
      context: buildContext(experience('exp-kl-shopping-01')),
      tracks: [missingTrack, ...tracks],
      mode: 'research',
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });

    expect(result.track).not.toBeNull();
    expect(result.track?.track_id).not.toBe('fx-missing-file');
    expect(result.missingAudioFiles).toContain('audio/track-404.mp3');
  });

  it('never returns a track outside the available file list', () => {
    for (const exp of experiences) {
      const result = recommend(inputFor(exp.experience_id));
      if (result.track) {
        expect(AVAILABLE_AUDIO_FILES).toContain(result.track.file_reference);
      }
    }
  });
});

describe('Missing optional metadata', () => {
  it('handles an experience with a null place type and destination', () => {
    const result = recommend(inputFor('exp-missing-place'));
    expect(result.track).not.toBeNull();
    expect(result.reason).toBe('category_match');
  });

  it('writes an experience with a null category to the place-type bridge', () => {
    const result = recommend(inputFor('exp-missing-category'));
    expect(result.track).not.toBeNull();
    // The experience has no category but carries place_type city_centre, so
    // it matches the versatile general pool's tracks before falling all the
    // way to the bare general fallback.
    expect(result.reason).toBe('place_type_match');
    expect(result.matchedValue).toBe('city_centre');
    expect(result.matchedField).toBe('place_types');
    expect(result.track?.place_types).toContain('city_centre');
  });

  it('does not crash on tracks with missing optional arrays', () => {
    const partial = {
      ...tracks[0],
      track_id: 'fx-partial',
      moods: undefined,
      genres: undefined,
      place_types: undefined,
      destinations: undefined,
      categories: undefined,
      energy: undefined,
    } as unknown as Track;

    expect(() =>
      recommend({
        context: buildContext(experience('exp-kl-shopping-01')),
        tracks: [partial],
        mode: 'research',
        availableAudioFiles: AVAILABLE_AUDIO_FILES,
      }),
    ).not.toThrow();

    const result = recommend({
      context: buildContext(experience('exp-kl-shopping-01')),
      tracks: [partial],
      mode: 'research',
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(result.reason).toBe('general_fallback');
    expect(result.track?.track_id).toBe('fx-partial');
  });
});

describe('Duplicate / repeated track selection', () => {
  it('avoids immediate repetition when an alternative candidate exists', () => {
    const context = {
      key: 'fx-general',
      label: 'general fixture',
      categoryId: null,
      placeType: null,
      destination: null,
      preferredMoods: [],
      energyRange: null,
    };
    const first = recommend({
      context,
      tracks,
      mode: 'research',
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
    });
    expect(first.track).not.toBeNull();

    const second = recommend({
      context,
      tracks,
      mode: 'research',
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
      avoidTrackIds: [first.track!.track_id],
    });
    expect(second.track).not.toBeNull();
    expect(second.track?.track_id).not.toBe(first.track?.track_id);
    expect(second.repeatUnavoidable).toBe(false);
  });

  it('reuses the only candidate and flags the repeat when no alternative exists', () => {
    // A pool fixture with exactly one track in it.
    const onlyTrack = {
      ...tracks[0],
      track_id: 'fx-only',
      categories: ['mountain'],
      place_types: [],
      destinations: [],
    } as unknown as Track;
    const singlePool = (avoidTrackIds: string[]) =>
      recommend({
        context: {
          key: 'fx-single',
          label: 'single-track pool fixture',
          categoryId: 'mountain',
          placeType: null,
          destination: null,
          preferredMoods: [],
          energyRange: null,
        },
        tracks: [onlyTrack],
        mode: 'research',
        availableAudioFiles: AVAILABLE_AUDIO_FILES,
        avoidTrackIds,
      });

    const first = singlePool([]);
    expect(first.track?.track_id).toBe('fx-only');

    const second = singlePool(['fx-only']);
    // There is no second mountain track, so the same one is used again.
    expect(second.track?.track_id).toBe('fx-only');
    expect(second.repeatUnavoidable).toBe(true);
    expect(second.explanation).toMatch(/no unplayed candidate/i);
  });

  it('keeps the queue moving when every candidate in the tier already played', () => {
    // A pool fixture with exactly two tracks in it.
    const pool = [
      'fx-1',
      'fx-2',
    ].map((id) => ({
      ...tracks[0],
      track_id: id,
      categories: ['streets'],
      place_types: [],
      destinations: [],
    })) as unknown as Track[];
    const recommendWith = (avoidTrackIds: string[]) =>
      recommend({
        context: {
          key: 'fx-streets',
          label: 'two-track pool fixture',
          categoryId: 'streets',
          placeType: null,
          destination: null,
          preferredMoods: [],
          energyRange: null,
        },
        tracks: pool,
        mode: 'research',
        availableAudioFiles: AVAILABLE_AUDIO_FILES,
        avoidTrackIds,
      });

    const first = recommendWith([]);
    const second = recommendWith([first.track!.track_id]);
    expect(second.track?.track_id).not.toBe(first.track?.track_id);

    // Both pool tracks have played: the one that played longest ago comes
    // back so the music does not get stuck.
    const third = recommendWith([first.track!.track_id, second.track!.track_id]);
    expect(third.track?.track_id).toBe(first.track?.track_id);
    expect(third.repeatUnavoidable).toBe(true);
  });
});
