/**
 * Audio library tests — the real files on disk.
 *
 * These tests look at the bytes that are actually stored in `public/audio/`
 * and compare them with the claims made in `data/catalogue.json` and
 * `data/audio-library.json`:
 *
 *  - the catalogue holds 59 unique records backed by real local recordings
 *  - every catalogue file_reference points at a file that exists
 *  - the SHA-256 checksum in the catalogue is the checksum of that file
 *  - the duration in the catalogue is the duration measured from the MP3
 *    frame headers of that file
 *  - no two tracks share the same audio (strict de-duplication)
 *  - the ten demo files are all different from each other
 *  - every file in public/audio is used by exactly one catalogue record
 *  - every record belongs to exactly one of the 21 disjoint category pools
 *
 * The duration is measured again inside this file with a small, separate MP3
 * frame reader on purpose: when the build script and the test share the same
 * parser, the test can no longer prove that the recorded numbers are right.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import audioLibraryJson from '../data/audio-library.json';
import { AUDIO_LIBRARY, AVAILABLE_AUDIO_FILES, checksumFor } from '../src/audioManifest';
import { tracks } from '../src/data/dataset';

const ROOT = process.cwd();
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');

interface LibraryFile {
  file_reference: string;
  sha256: string;
  bytes: number;
  duration_seconds: number;
  sample_rate_hz: number;
  channels: number;
  bitrate_kbps: number;
  frames: number;
  origin: string;
  origin_detail: string;
  provenance_note: string;
}

const libraryFiles: LibraryFile[] = (
  audioLibraryJson as unknown as { files: LibraryFile[] }
).files;

/** Bitrate tables for MPEG Layer III (ISO/IEC 11172-3 / 13818-3). */
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

/**
 * Measures the playing time of an MP3 by walking its frame headers.
 * Returns the duration in seconds and the number of frames it found.
 */
function measureMp3(buffer: Buffer): { seconds: number; frames: number } {
  let offset = -1;
  for (let i = 0; i + 4 <= buffer.length; i += 1) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
      offset = i;
      break;
    }
  }
  if (offset === -1) throw new Error('No MPEG frame header found.');

  let seconds = 0;
  let frames = 0;
  while (offset + 4 <= buffer.length) {
    const b1 = buffer[offset + 1];
    const b2 = buffer[offset + 2];
    const versionId = (b1 >> 3) & 0x03;
    const layerId = (b1 >> 1) & 0x03;
    if (versionId === 1 || layerId !== 1) break;
    const bitrateIndex = (b2 >> 4) & 0x0f;
    const sampleRateIndex = (b2 >> 2) & 0x03;
    const padding = (b2 >> 1) & 0x01;
    if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) break;
    const bitrate = (versionId === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex];
    const sampleRate = SAMPLE_RATES[versionId][sampleRateIndex];
    const samplesPerFrame = versionId === 3 ? 1152 : 576;
    const frameLength =
      Math.floor((samplesPerFrame / 8) * bitrate * 1000) / sampleRate + padding;
    if (!Number.isFinite(frameLength) || frameLength <= 0) break;
    seconds += samplesPerFrame / sampleRate;
    frames += 1;
    offset += Math.floor(frameLength);
  }
  return { seconds, frames };
}

function sha256Of(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function absolutePathFor(fileReference: string): string {
  return path.join(ROOT, 'public', fileReference.replace(/^\/+/, ''));
}

describe('the catalogue describes the files that are really on disk', () => {
  it('holds 59 records with unique ids and unique audio', () => {
    expect(tracks).toHaveLength(59);
    expect(new Set(tracks.map((track) => track.track_id)).size).toBe(59);
    expect(new Set(tracks.map((track) => track.checksum)).size).toBe(59);
  });

  it('points every record at a file that exists', () => {
    for (const track of tracks) {
      expect(track.file_reference, `${track.track_id} has no file reference`).toBeTruthy();
      expect(
        fs.existsSync(absolutePathFor(track.file_reference as string)),
        `${track.track_id} -> ${track.file_reference} is missing`,
      ).toBe(true);
    }
  });

  it('stores the real SHA-256 checksum of every file', () => {
    for (const track of tracks) {
      const file = absolutePathFor(track.file_reference as string);
      const actual = sha256Of(fs.readFileSync(file));
      expect(actual, `${track.track_id} checksum`).toBe(track.checksum);
      expect(checksumFor(track.file_reference)).toBe(actual);
    }
  });

  it('stores the real duration of every file', () => {
    for (const track of tracks) {
      const file = absolutePathFor(track.file_reference as string);
      const measured = measureMp3(fs.readFileSync(file));
      expect(measured.frames, `${track.track_id} frames`).toBeGreaterThan(100);
      expect(
        Math.abs(measured.seconds - (track.duration_seconds as number)),
        `${track.track_id} duration`,
      ).toBeLessThan(0.25);
      expect(track.duration_seconds as number).toBeGreaterThan(5);
    }
  });

  it('keeps the ten demo files different from each other', () => {
    const demoFiles = tracks.slice(0, 10).map((track) => track.file_reference as string);
    expect(demoFiles).toEqual([
      'audio/track-1.mp3',
      'audio/track-2.mp3',
      'audio/track-3.mp3',
      'audio/track-4.mp3',
      'audio/track-5.mp3',
      'audio/track-6.mp3',
      'audio/track-7.mp3',
      'audio/track-8.mp3',
      'audio/track-9.mp3',
      'audio/track-10.mp3',
    ]);
    const checksums = demoFiles.map((file) => checksumFor(file));
    expect(new Set(checksums).size).toBe(10);
    for (const checksum of checksums) expect(checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses every file in public/audio exactly once', () => {
    const onDisk = fs
      .readdirSync(AUDIO_DIR)
      .filter((name) => name.toLowerCase().endsWith('.mp3'))
      .map((name) => `audio/${name}`)
      .sort();
    const referenced = tracks.map((track) => track.file_reference as string).sort();
    expect(referenced).toEqual(onDisk);
    expect(new Set(referenced).size).toBe(referenced.length);
    expect(AVAILABLE_AUDIO_FILES).toHaveLength(59);
  });
});

describe('data/audio-library.json', () => {
  it('describes every file with the measured facts', () => {
    expect(libraryFiles).toHaveLength(59);
    for (const entry of libraryFiles) {
      const file = absolutePathFor(entry.file_reference);
      const buffer = fs.readFileSync(file);
      expect(sha256Of(buffer), `${entry.file_reference} checksum`).toBe(entry.sha256);
      expect(buffer.length, `${entry.file_reference} bytes`).toBe(entry.bytes);
      const measured = measureMp3(buffer);
      expect(
        Math.abs(measured.seconds - entry.duration_seconds),
        `${entry.file_reference} duration`,
      ).toBeLessThan(0.25);
    }
  });

  it('agrees with the catalogue on checksums and durations', () => {
    const byReference = new Map(libraryFiles.map((entry) => [entry.file_reference, entry]));
    for (const track of tracks) {
      const entry = byReference.get(track.file_reference as string);
      expect(entry, `${track.track_id} is missing from the audio library`).toBeTruthy();
      expect(entry?.sha256).toBe(track.checksum);
      expect(entry?.duration_seconds).toBe(track.duration_seconds);
    }
  });

  it('is the same list the application uses at runtime', () => {
    expect(AUDIO_LIBRARY).toHaveLength(59);
    expect(AVAILABLE_AUDIO_FILES).toEqual(
      AUDIO_LIBRARY.map((entry) => entry.file_reference),
    );
  });
});

describe('catalogue shape', () => {
  it('assigns every record to exactly one of the disjoint buckets', () => {
    // Distribution plan: dedicated pools for the eight categories the sample
    // experiences use (sizes inside the agreed ranges) plus pools for every
    // remaining active category. Since 28 October ALL 21 categories own a
    // pool: the four re-downloaded recordings moved into family / adventure
    // / festivals / wellness, the same-day intake gave the last two
    // (historic_sites, rainy_day) their own songs, and the new recordings
    // grew family, festivals and wellness to two songs. Museums went down
    // to two and owes a song to return to its 3-4 range. No track is
    // shared between two pools.
    const poolPlan: Array<[string, number]> = [
      ['shopping', 6],
      ['nightlife', 3],
      ['markets', 3],
      ['cycling', 2],
      ['beaches', 3],
      ['walking', 4],
      ['dining', 3],
      ['cafes', 3],
      ['road_trips', 2],
      ['waterfronts', 4],
      ['parks', 3],
      ['hiking', 2],
      ['nature', 2],
      ['architecture', 3],
      ['museums', 2],
      ['family', 2],
      ['adventure', 1],
      ['festivals', 2],
      ['wellness', 2],
      ['historic_sites', 1],
      ['rainy_day', 1],
    ];
    const placeTypesByBucket: Record<string, string[]> = {
      shopping: ['shopping_mall'],
      nightlife: [],
      markets: ['street_market', 'night_market'],
      cycling: [],
      beaches: ['island_beach', 'resort_area'],
      walking: ['historic_street', 'heritage_district'],
      dining: [],
      cafes: ['cafe_district'],
      road_trips: [],
      waterfronts: ['waterfront_promenade'],
      parks: ['urban_park', 'botanical_garden'],
      hiking: ['mountain_trail'],
      nature: [],
      architecture: [],
      museums: ['art_museum'],
      family: [],
      adventure: [],
      festivals: [],
      wellness: [],
      historic_sites: [],
      rainy_day: [],
    };
    const pools = new Map(poolPlan.map(([category]) => [category, [] as string[]]));
    const general: string[] = [];
    for (const track of tracks) {
      if (track.categories.length === 0) {
        general.push(track.track_id);
        continue;
      }
      expect(track.categories).toHaveLength(1);
      expect(pools.has(track.categories[0])).toBe(true);
      pools.get(track.categories[0])!.push(track.track_id);
    }
    for (const [category, expectedSize] of poolPlan) {
      const ids = pools.get(category)!;
      expect(ids.length, `${category} pool size`).toBe(expectedSize);
      const members = tracks.filter((t) => t.categories[0] === category);
      for (const track of members) {
        expect(track.place_types, `${track.track_id} place types`).toEqual(
          placeTypesByBucket[category],
        );
      }
    }
    // The general pool backs the missing-category experience via its
    // city_centre place type and must avoid repeating one single song.
    expect(general).toHaveLength(5);
    for (const track of tracks.filter((t) => t.categories.length === 0)) {
      expect(track.place_types, `${track.track_id} place types`).toEqual([
        'city_centre',
        'transport_hub',
      ]);
    }
    // No track is claimed by two pools.
    const all = [...pools.values()].flat().concat(general);
    expect(new Set(all).size).toBe(59);
  });

  it('marks unverified source URLs honestly', () => {
    for (const track of tracks) {
      expect(track.source_url_status).toBe('candidate_unverified');
      expect(track.source_search_url).toMatch(/^https:\/\//);
      expect(track.review_status).toBe('pending_source_verification');
      expect(track.content_id_flag).toBe('unverified');
    }
  });

  it('approves all fifty-nine pool-backed recordings for production', () => {
    const approved = tracks.filter((track) => track.approved_for_production);
    expect(approved).toHaveLength(59);
    expect(approved.map((track) => track.file_reference)).toEqual(
      Array.from({ length: 59 }, (_, index) => `audio/track-${index + 1}.mp3`),
    );
  });

  it('records where every file came from', () => {
    const origins = new Set(libraryFiles.map((entry) => entry.origin));
    // Thirteen full copies and four locally cut excerpts - no more machine
    // generated beds in the library.
    expect(origins).toContain('approved_pool_recording');
    expect(origins).toContain('approved_pool_excerpt');
    expect(origins).not.toContain('generated_placeholder_bed');
    for (const entry of libraryFiles) {
      expect(entry.origin_detail).toBeTruthy();
      expect(entry.provenance_note).toBeTruthy();
    }
  });
});
