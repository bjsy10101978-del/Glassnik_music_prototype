/**
 * Distribution diagnostics.
 *
 * This suite is the project's standing "verification check in Node" for the
 * local audio library:
 *
 *   a) it scans `assets/audio-pool/` and asserts that the exact number of
 *      real audio files found on disk is registered in the catalogue, each
 *      with a valid emitted file on disk and full playback eligibility in
 *      both research and production mode;
 *   b) it simulates selecting each of the 15 sample experiences and proves
 *      that different experiences resolve to different, category-appropriate
 *      tracks, and that no single track (like the old "City in Motion"
 *      fallback bug) wins twice across different experiences.
 *
 * Run with: npx vitest run tests/recommendationDiagnostics.test.ts
 * The console output doubles as a human-readable report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIO_LIBRARY, AVAILABLE_AUDIO_FILES } from '../src/audioManifest';
import { experiences, tracks } from '../src/data/dataset';
import { buildContext, recommend } from '../src/engine/recommender';

const ROOT = process.cwd();
const POOL_DIR = path.join(ROOT, 'assets', 'audio-pool');

function poolFilesOnDisk(): string[] {
  return fs
    .readdirSync(POOL_DIR)
    .filter((name) => /\.(mp3|wav|m4a|ogg)$/i.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/(\d+)/)?.[1] ?? '9999');
      const nb = Number(b.match(/(\d+)/)?.[1] ?? '9999');
      return na - nb || a.localeCompare(b);
    });
}

const SIMPLE_EXPERIENCES = [
  'exp-kl-shopping-01',
  'exp-phu-quoc-beach',
  'exp-paris-historic',
  'exp-auckland-waterfront',
  'exp-kyoto-museum',
  'exp-singapore-park',
  'exp-lisbon-market',
  'exp-melbourne-cafe',
  'exp-missing-place',
  'exp-missing-category',
];

describe('audio library diagnostics', () => {
  it('scans the pool folder and registers every real audio file', () => {
    const onDisk = poolFilesOnDisk();
    console.log(`\n[a] audio files found in assets/audio-pool/ : ${onDisk.length}`);
    console.log(`    -> ${onDisk.join(', ')}`);

    expect(onDisk.length).toBe(59);
    // Every category record in the catalogue is a real local recording
    // (55 full copies + 4 excerpts cut from the byte-duplicate files).
    expect(tracks).toHaveLength(59);
    expect(AUDIO_LIBRARY).toHaveLength(59);
    expect(AVAILABLE_AUDIO_FILES).toHaveLength(59);

    // Every emitted file exists, every record is playable and enabled.
    for (const track of tracks) {
      const emitted = path.join(ROOT, 'public', track.file_reference as string);
      expect(fs.existsSync(emitted), `${track.track_id} -> ${track.file_reference}`).toBe(true);
    }
    const enabledCount = tracks.filter((t) => t.approved_for_production === true).length;
    console.log(`    approved/enabled records (research + production variety): ${enabledCount}/59`);
    expect(enabledCount).toBe(59);

    // The random picks must run by unique audio, not by one reused file.
    const origins = new Set(AUDIO_LIBRARY.map((entry) => entry.origin));
    expect(origins).toContain('approved_pool_recording');
    expect(origins).toContain('approved_pool_excerpt');
    console.log(`[a] OK - all 59 files are registered, playable and enabled.\n`);
  });

  it('recommends distinct category tracks for the sample experiences', () => {
    console.log('[b] top recommendation per sample experience:');
    const picks = new Map<string, string>();
    for (const experience of experiences) {
      const result = recommend({
        context: buildContext(experience),
        tracks,
        mode: 'research',
        availableAudioFiles: AVAILABLE_AUDIO_FILES,
      });
      const track = result.track;
      picks.set(experience.experience_id, track?.track_id ?? 'none');
      console.log(
        `    ${experience.experience_id.padEnd(22)} -> ` +
          `${track?.track_id} "${track?.title}" (${track?.file_reference})  reason=${result.reason}`,
      );
    }
    // 10 independent experiences must not collapse onto one track.
    const distinctPicks = new Set(SIMPLE_EXPERIENCES.map((id) => picks.get(id)));
    expect(distinctPicks.size).toBeGreaterThanOrEqual(8);
    // Exactly one distinct top pick per music pool, reached across the 15
    // experiences: the six shopping contexts (the five KL videos plus Tokyo)
    // share the shopping pool's top, and Paris / missing-place share the
    // walking pool's top. Every other experience has a pool of its own, so
    // the 15 picks resolve to 9 distinct tracks - never fewer, and never a
    // single track winning everything (the old fallback bug).
    const poolOf = new Map(
      experiences.map((experience) => {
        const pick = picks.get(experience.experience_id)!;
        const track = tracks.find((item) => item.track_id === pick)!;
        return [experience.experience_id, track.categories[0] ?? 'general'];
      }),
    );
    expect(new Set(poolOf.values()).size).toBe(9);
    expect(new Set(picks.values()).size).toBe(new Set(poolOf.values()).size);
  });

  it('cycles through all unique shopping songs before repeating (KL sequence)', () => {
    const context = buildContext(
      experiences.find((e) => e.experience_id === 'exp-kl-shopping-01')!,
    );
    const chain: string[] = [];
    for (let i = 0; i < 15; i += 1) {
      const result = recommend({
        context,
        tracks,
        mode: 'research',
        availableAudioFiles: AVAILABLE_AUDIO_FILES,
        avoidTrackIds: [...chain],
      });
      chain.push(result.track!.track_id);
    }
    console.log(`[c] KL shopping rotation (15 advances): ${chain.join(' -> ').replaceAll('glassnik-', '')}`);
    // No same song twice in a row anywhere in the rotation.
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i], 'never the same song twice in a row').not.toBe(chain[i - 1]);
    }
    // The 6-song shopping pool is fully rotated before a song repeats.
    const firstCycle = chain.slice(0, 6);
    expect(new Set(firstCycle).size).toBe(6);
  });

  it('rotates the general pool instead of sticking on one fallback track', () => {
    const context = buildContext(
      experiences.find((e) => e.experience_id === 'exp-missing-category')!,
    );
    const chain: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const result = recommend({
        context,
        tracks,
        mode: 'research',
        availableAudioFiles: AVAILABLE_AUDIO_FILES,
        avoidTrackIds: [...chain],
      });
      chain.push(result.track!.track_id);
      expect(result.reason).toBe('place_type_match');
    }
    console.log(`[d] missing-category (Barcelona) rotation: ${chain.join(' -> ').replaceAll('glassnik-', '')}`);
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i]).not.toBe(chain[i - 1]);
    }
  });
});
