#!/usr/bin/env node
/**
 * Glassnik local data build pipeline.
 *
 * Regenerates, from scratch and without touching the network, a library of
 * REAL local music only. There are no generated placeholder beds:
 *
 *   1. `public/audio/track-1.mp3` .. `track-<N>.mp3`
 *        - Every local pool recording in `assets/audio-pool/` is scanned
 *          (MP3 only, sorted naturally: Songs0, Songs1, ... Songs54).
 *        - Recordings that are byte-identical to an earlier file are not
 *          copied again; instead a genuine excerpt is cut from that file's
 *          decoded audio and re-encoded, so *every file on disk* backs a
 *          catalogue entry and every entry still holds unique audio.
 *        - Across rebuilds every existing recording keeps the pool bucket
 *          it already had (anchored by checksum), except the recordings
 *          named in POOL_REASSIGNMENTS, which were moved to the buckets
 *          that had no pool yet.
 *
 *   2. `data/audio-library.json`
 *        - the real SHA-256 checksum, byte size, measured duration and
 *          provenance of every built file
 *
 *   3. `data/catalogue.json`
 *        - one record per built file. Every one of the eight sample-experience
 *          categories gets its own disjoint pool, plus a small general pool
 *          for contexts without a category. No track is ever shared between
 *          two categories. Pool sizes follow the distribution plan; the
 *          general pool is spread across the loudness range so the fallback
 *          stays versatile.
 *
 *   Usage: node scripts/build-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import lamejs from '@breezystack/lamejs';

import { parseMp3 } from './lib/mp3.mjs';
import { cutExcerpt, decodeMp3, toInt16 } from './lib/decode.mjs';
import {
  ARTIST_FIRST_NAMES,
  ARTIST_LAST_NAMES,
  GENRE_POOL,
  SECONDARY_MOODS,
  VOCALS_CYCLE,
  pixabaySearchUrl,
  pixabayTrackUrl,
} from './lib/enrich.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const POOL_DIR = path.join(ROOT, 'assets', 'audio-pool');
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const DATA_DIR = path.join(ROOT, 'data');

const LICENCE_SOURCE = 'https://pixabay.com/service/license-summary/';

/** Bitrate used for the re-encoded excerpts. */
const EXCERPT_BITRATE_KBPS = 128;

/**
 * Category pool plan: the counts are the project's distribution decision.
 * The eight sample-experience categories sit inside the agreed ranges
 * (shopping 6-7, beaches 3-4, walking 4-5, waterfronts 3-4, museums 3-4,
 * parks 3-4, markets 3-4, cafes 3-4). With enough recordings the remaining
 * active categories get their own pools too, so no upload category has to
 * borrow music: after 28 October only historic_sites and rainy_day still
 * draw from the general pool, while family, adventure, festivals and
 * wellness each start with one song of their own (single-track pools, to
 * be grown).
 *
 * Rebuild rule: existing recordings keep the pool bucket they already have
 * (anchored by checksum), except the four recordings in POOL_REASSIGNMENTS
 * that were moved into the buckets without a pool (they turn out to be the
 * very recordings the team later re-downloaded for those categories; each
 * donor pool above stays inside its agreed range). Every pool is disjoint
 * - no track is ever shared - and the sizes must sum to the built track
 * count (the build throws otherwise).
 */
const POOL_ORDER = [
  { category: 'shopping', size: 6 }, // KL 5-video sequence + Tokyo (one song became festivals)
  { category: 'nightlife', size: 3 }, // evening / after-dark uploads
  { category: 'markets', size: 3 }, // Lisbon street market (+ night market)
  { category: 'cycling', size: 2 }, // cycle-route uploads
  { category: 'beaches', size: 3 }, // Phu Quoc beach walk (one song became adventure)
  { category: 'walking', size: 4 }, // Paris historic street + missing place
  { category: 'dining', size: 3 }, // dinner + restaurant uploads
  { category: 'cafes', size: 3 }, // Melbourne cafe district (one song became family)
  { category: 'road_trips', size: 2 }, // scenic-drive uploads
  { category: 'waterfronts', size: 4 }, // Auckland waterfront evening
  { category: 'parks', size: 3 }, // Singapore park loop
  { category: 'hiking', size: 2 }, // mountain-trail uploads
  { category: 'nature', size: 2 }, // countryside / coast uploads
  { category: 'architecture', size: 3 }, // buildings / landmarks uploads
  { category: 'museums', size: 2 }, // Kyoto museum afternoon (one song became historic_sites)
  { category: 'family', size: 2 }, // children-ukulele + indie-rock recordings
  { category: 'adventure', size: 1 }, // the trailer-intro recording (grows later)
  { category: 'festivals', size: 2 }, // funk/party + percussion recordings
  { category: 'wellness', size: 2 }, // chill-rnb + long-day recordings
  { category: 'historic_sites', size: 1 }, // the quiet cinematic recording (moved from museums)
  { category: 'rainy_day', size: 1 }, // the quiet-courtyard lofi recording
];

/**
 * One-track transfers: these existing recordings (keyed by track id - ids
 * follow the recordings across rebuilds, anchored by checksum) moved into
 * the buckets that had no pool, because the four byte-identical copies the
 * team downloaded for family / adventure / festivals / wellness are these
 * exact recordings and no pool may hold the same audio twice.
 */
const POOL_REASSIGNMENTS = {
  'glassnik-023': 'family', // Ferris Wheels - children-ukulele recording
  'glassnik-021': 'adventure', // Soft Machine - trailer-intro recording
  'glassnik-025': 'festivals', // Marble Floor - funk/party recording
  'glassnik-022': 'wellness', // Paper Boats - chill-rnb recording
  'glassnik-032': 'historic_sites', // Quiet Machines - quiet cinematic recording
};

/**
 * New-intake routing: recordings genuinely new to the library, keyed by the
 * pool file name they arrived under. Anything not listed is dealt into the
 * first pool with spare capacity (POOL_ORDER order). The build's strict
 * per-pool size check will refuse a wrong count either way.
 */
const NEW_BUCKET_BY_SOURCE = {
  'artur_aravidi_music-a-quiet-courtyard-lofi-621847.mp3': 'rainy_day',
  'echobrainz-africa-623614.mp3': 'festivals',
  'echobrainz-upbeat-indie-rock-624221.mp3': 'family',
  'purrplecat-long-day-518602.mp3': 'wellness',
};

/**
 * The versatile general pool for contexts that carry no category (the
 * missing-category experience, uploads without metadata, and the two
 * categories still without a pool: historic_sites and rainy_day). Instead
 * of taking the softest songs, these rank positions are reserved so the
 * pool spans the loudness range. On a first build from scratch these ranks
 * pick which recordings land here; on later builds the general tracks keep
 * their buckets like every other established pool.
 */
const GENERAL_POOL_RANKS = [10, 21, 32, 43, 54];

/** Where the excerpt cut starts, per source recording (seconds). */
const EXCERPT_START_SECONDS = 30;

/** Character per bucket (primary mood + genre), ordered strong to soft. */
const CATEGORY_CHARACTER = {
  shopping: { mood: 'upbeat', genre: 'house' },
  nightlife: { mood: 'lively', genre: 'synthwave' },
  markets: { mood: 'lively', genre: 'trip hop' },
  cycling: { mood: 'energetic', genre: 'drum and bass' },
  beaches: { mood: 'playful', genre: 'tropical' },
  walking: { mood: 'uplifting', genre: 'pop' },
  dining: { mood: 'romantic', genre: 'jazz-hop' },
  cafes: { mood: 'relaxed', genre: 'lofi' },
  road_trips: { mood: 'nostalgic', genre: 'soft rock' },
  waterfronts: { mood: 'serene', genre: 'ambient' },
  parks: { mood: 'peaceful', genre: 'acoustic' },
  hiking: { mood: 'tranquil', genre: 'cinematic' },
  nature: { mood: 'refreshing', genre: 'chillhop' },
  architecture: { mood: 'reflective', genre: 'neoclassical' },
  museums: { mood: 'calm', genre: 'ambient' },
  family: { mood: 'cheerful', genre: 'ukulele pop' },
  adventure: { mood: 'energetic', genre: 'cinematic' },
  festivals: { mood: 'lively', genre: 'funk' },
  wellness: { mood: 'calm', genre: 'smooth rnb' },
  historic_sites: { mood: 'reflective', genre: 'ambient' },
  rainy_day: { mood: 'wistful', genre: 'lofi' },
  general: { mood: 'wistful', genre: 'indie' },
};

/** Place types owned by each bucket (must exist in data/taxonomy.json). */
const CATEGORY_PLACE_TYPES = {
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
  general: ['city_centre', 'transport_hub'],
};

/** Placeholder titles for tracks beyond the reused catalogue titles. */
const EXTRA_TITLES = [
  'Copper Skies', 'Neon Arcade', 'Golden Hour Drive', 'Soft Machine',
  'Paper Boats', 'Ferris Wheels', 'Slow Signal', 'Marble Floor',
  'Idle Current', 'Café Riddle', 'Tail Lights', 'Open Windows',
  'Glass City', 'Night Ferry', 'Quiet Machines', 'River Letters',
  'Sunlounger', 'Blue Platform', 'Cardboard Sun', 'Late Tram',
  'Second Spring', 'Slow Tide', 'Gentle Stream', 'Festival Nightfall',
  'Ukulele Morning', 'Paper Bridge', 'Low Horizon', 'Hotel Neon',
  'Sunday Dust', 'Crystal Air', 'Blue Hour Bus', 'Morning Spokes',
  'Altitude Song', 'Green Tunnel', 'Stone & Glass', 'Sea Grain',
  'Circle Dance', 'Quiet Parade', 'Deep Pool', 'Paper Lantern',
  'Blue Detour', 'Somewhere Bright', 'Ridge Runner',
];

/** Extra placeholder artist built from the local name pools. */
function extraArtist(number) {
  const first = ARTIST_FIRST_NAMES[(number * 7) % ARTIST_FIRST_NAMES.length];
  const last = ARTIST_LAST_NAMES[(number * 11 + 3) % ARTIST_LAST_NAMES.length];
  return `${first} ${last}`;
}

/** Natural file-name order: Songs2 < Songs10, families stay grouped. */
function naturalNumber(name) {
  const match = name.match(/(\d+)\.mp3$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function naturalCompare(a, b) {
  return (
    naturalNumber(a) - naturalNumber(b) ||
    a.localeCompare(b, undefined, { numeric: true })
  );
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Encodes decoded stereo PCM to MP3 with the bundled pure-JS LAME encoder. */
function encodeStereoMp3(left, right, sampleRate, bitrateKbps) {
  const encoder = new lamejs.Mp3Encoder(2, sampleRate, bitrateKbps);
  const chunks = [];
  const block = 1152;
  for (let offset = 0; offset < left.length; offset += block) {
    const end = Math.min(offset + block, left.length);
    const encoded = encoder.encodeBuffer(left.subarray(offset, end), right.subarray(offset, end));
    if (encoded.length > 0) chunks.push(Buffer.from(encoded));
  }
  const flushed = encoder.flush();
  if (flushed.length > 0) chunks.push(Buffer.from(flushed));
  return Buffer.concat(chunks);
}

/** Writes one catalogue file and returns its measured facts. */
function writeAudioFile(fileName, buffer) {
  const target = path.join(AUDIO_DIR, fileName);
  fs.writeFileSync(target, buffer);
  const parsed = parseMp3(buffer);
  if (!parsed.valid) {
    throw new Error(`${fileName} is not a readable MP3: ${parsed.error}`);
  }
  return {
    bytes: buffer.length,
    sha256: sha256(buffer),
    duration_seconds: Number(parsed.durationSeconds.toFixed(3)),
    sample_rate_hz: parsed.sampleRate,
    channels: parsed.channels,
    bitrate_kbps: parsed.bitrateKbps,
    frames: parsed.frames.length,
  };
}

/** Root-mean-square loudness of decoded mono/stereo samples (0..1 scale). */
function rmsOf(channelData) {
  let sumSquares = 0;
  let count = 0;
  for (const channel of channelData) {
    for (let i = 0; i < channel.length; i += 1) {
      const sample = channel[i];
      sumSquares += sample * sample;
      count += 1;
    }
  }
  if (count === 0) return 0;
  return Math.sqrt(sumSquares / count);
}

/** Segment length of a decoded pool recording. */
function decodedSeconds(channelData, sampleRate) {
  return (channelData[0]?.length ?? 0) / sampleRate;
}

async function main() {
  const oldCatalogue = readJson(path.join(DATA_DIR, 'catalogue.json'));
  const taxonomy = readJson(path.join(DATA_DIR, 'taxonomy.json'));

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.mkdirSync(POOL_DIR, { recursive: true });

  // A rebuild must not leave stale track files from an earlier, larger
  // build behind: every shipped track file belongs to exactly one record.
  for (const staleName of fs.readdirSync(AUDIO_DIR)) {
    if (/^track-\d+\.mp3$/i.test(staleName)) {
      fs.rmSync(path.join(AUDIO_DIR, staleName));
    }
  }

  const categoryIds = new Set(taxonomy.category_ids.map((c) => c.category_id));
  const placeTypeIds = new Set(
    taxonomy.place_types.map((p) => p.place_type),
  );

  // --- scan the pool folder ---------------------------------------------
  const poolFiles = fs
    .readdirSync(POOL_DIR)
    .filter((name) => /\.(mp3|m4a|wav|ogg)$/i.test(name))
    .filter((name) => /\.mp3$/i.test(name)) // the pipeline decodes MP3 only
    .sort(naturalCompare);
  if (poolFiles.length === 0) {
    throw new Error(`No MP3 recordings found in ${POOL_DIR}.`);
  }
  const skippedFormats = fs
    .readdirSync(POOL_DIR)
    .filter((name) => /\.(m4a|wav|ogg)$/i.test(name));
  if (skippedFormats.length > 0) {
    console.warn(`NOTE: unsupported formats ignored (${skippedFormats.join(', ')}).`);
  }
  console.log(`Pool scan      : ${poolFiles.length} MP3 files in assets/audio-pool/`);

  // --- checksum the pool recordings, group byte-duplicates ---------------
  const groupHead = new Map(); // checksum -> file name of the full copy
  const excerptSources = []; // duplicate files that become excerpt sources
  for (const name of poolFiles) {
    const buffer = fs.readFileSync(path.join(POOL_DIR, name));
    const checksum = sha256(buffer);
    if (groupHead.has(checksum)) {
      excerptSources.push(name);
    } else {
      groupHead.set(checksum, name);
    }
  }
  const fullFiles = poolFiles.filter((name) => !excerptSources.includes(name));

  // --- decode every recording once ---------------------------------------
  const decoded = new Map(); // file name -> { channelData, sampleRate }
  for (const poolName of poolFiles) {
    if (decoded.has(poolName)) continue;
    decoded.set(
      poolName,
      await decodeMp3(fs.readFileSync(path.join(POOL_DIR, poolName))),
    );
  }

  // --- build entries: 1 full copy per unique recording -------------------
  const entries = [];
  for (const poolName of fullFiles) {
    const buffer = fs.readFileSync(path.join(POOL_DIR, poolName));
    const channel = decoded.get(poolName);
    entries.push({
      buffer,
      origin: 'approved_pool_recording',
      originDetail: `assets/audio-pool/${poolName}`,
      provenanceNote:
        'Human-sourced local recording copied unchanged from the local audio pool. Rights review still outstanding.',
      rms: rmsOf(channel.channelData),
    });
  }

  // --- excerpt for every duplicate file, so no file is skipped -----------
  for (const poolName of excerptSources) {
    const { channelData, sampleRate } = decoded.get(poolName);
    const totalSeconds = decodedSeconds(channelData, sampleRate);
    const startSeconds = Math.min(EXCERPT_START_SECONDS, Math.max(1, totalSeconds * 0.25));
    const endSeconds = Math.max(startSeconds + 20, Math.min(startSeconds + 60, totalSeconds - 3));
    const excerpt = cutExcerpt(channelData, sampleRate, startSeconds, endSeconds);
    const left = toInt16(excerpt.channelData[0]);
    const right = toInt16(excerpt.channelData[1] ?? excerpt.channelData[0]);
    entries.push({
      buffer: encodeStereoMp3(left, right, excerpt.sampleRate, EXCERPT_BITRATE_KBPS),
      origin: 'approved_pool_excerpt',
      originDetail: `assets/audio-pool/${poolName} (${excerpt.startSeconds.toFixed(2)}s–${excerpt.endSeconds.toFixed(2)}s)`,
      provenanceNote:
        `Decoded locally, cut (${excerpt.startSeconds.toFixed(2)}s–` +
        `${excerpt.endSeconds.toFixed(2)}s) and re-encoded. Different audio content and bytes ` +
        `from the byte-duplicate recording on disk. Rights review still outstanding.`,
      rms: rmsOf(excerpt.channelData),
    });
  }

  const trackCount = entries.length;
  if (POOL_ORDER.reduce((sum, band) => sum + band.size, 0) + GENERAL_POOL_RANKS.length !== trackCount) {
    throw new Error(
      `Pool plan (sizes ${POOL_ORDER.map((b) => `${b.category}:${b.size}`).join(', ')} + general ` +
        `${GENERAL_POOL_RANKS.length}) sums to ` +
        `${POOL_ORDER.reduce((s, b) => s + b.size, 0) + GENERAL_POOL_RANKS.length} but ${trackCount} tracks were built.`,
    );
  }

  // --- write files, measure, require unique checksums --------------------
  const library = entries.map((entry, index) => {
    const fileName = `track-${index + 1}.mp3`;
    const facts = writeAudioFile(fileName, entry.buffer);
    return {
      ...facts,
      number: index + 1,
      file_reference: `audio/${fileName}`,
      origin: entry.origin,
      origin_detail: entry.originDetail,
      provenance_note: entry.provenanceNote,
      rms: entry.rms,
    };
  });

  const checksums = new Set(library.map((entry) => entry.sha256));
  if (checksums.size !== library.length) {
    throw new Error(
      `Duplicate checksums in the generated audio library (${checksums.size} unique of ${library.length}).`,
    );
  }

  // --- measured energy ----------------------------------------------------
  const rmsValues = library.map((entry) => entry.rms);
  const minRms = Math.min(...rmsValues);
  const maxRms = Math.max(...rmsValues);
  const spread = maxRms - minRms;
  const energyOf = (rms) =>
    spread === 0 ? 0.5 : Number((0.15 + 0.75 * ((rms - minRms) / spread)).toFixed(3));

  // --- bucket assignment ---------------------------------------------------
  // Existing recordings keep the bucket they were built with - the anchor is
  // the recording's checksum (and, for the re-encoded excerpts, the pool
  // file named in the old provenance), so track numbers can shift between
  // builds without moving any song between pools. Genuinely new recordings
  // are dealt, in natural order, into the buckets that had no pool yet.
  // Measured loudness stays in the per-track energy score only.
  const oldTracks = oldCatalogue.tracks;
  const oldByChecksum = new Map(oldTracks.map((t) => [t.checksum, t]));
  const oldExcerptByPoolFile = new Map(
    oldTracks.flatMap((t) => {
      const match = String(t.provenance?.audio_source_file ?? '').match(
        /^assets\/audio-pool\/(.+?) \(/,
      );
      return match ? [[match[1], t]] : [];
    }),
  );
  const recordFor = (entry) =>
    oldByChecksum.get(entry.sha256) ??
    (entry.origin === 'approved_pool_excerpt'
      ? oldExcerptByPoolFile.get(
          entry.origin_detail.replace(/^assets\/audio-pool\//, '').split(' ')[0],
        )
      : undefined);

  const assignment = new Map(); // track number -> category or 'general'
  const oldTrackIdByChecksum = new Map(oldTracks.map((t) => [t.checksum, t.track_id]));
  if (oldTracks.length === 0) {
    // First build on an empty catalogue: spread every bucket across the
    // loudness range exactly like the original plan.
    const byEnergy = [...library].sort((a, b) => b.rms - a.rms || a.number - b.number);
    const generalRanks = new Set(GENERAL_POOL_RANKS);
    for (const [rank, entry] of byEnergy.entries()) {
      if (generalRanks.has(rank)) {
        assignment.set(entry.number, 'general');
      }
    }
    let firstCursor = 0;
    const nonGeneralRanks = byEnergy.filter((_, rank) => !generalRanks.has(rank));
    for (const band of POOL_ORDER) {
      for (let n = 0; n < band.size; n += 1) {
        const entry = nonGeneralRanks[firstCursor];
        if (!entry) throw new Error(`Bucket ${band.category} ran out of tracks.`);
        assignment.set(entry.number, band.category);
        firstCursor += 1;
      }
    }
  } else {
    // Existing recordings keep their bucket (or the transfer one listed in
    // POOL_REASSIGNMENTS). Recordings that are genuinely new to the library
    // get the bucket planned for their source file in NEW_BUCKET_BY_SOURCE,
    // or - when no plan exists - are dealt into the first pool with spare
    // capacity (POOL_ORDER order). The strict per-pool size check below
    // refuses any wrong count either way.
    const pinnedCounts = new Map();
    for (const entry of library) {
      const pinned = recordFor(entry);
      const transfer = pinned
        ? POOL_REASSIGNMENTS[oldTrackIdByChecksum.get(entry.sha256) ?? ''] ?? null
        : null;
      if (transfer) {
        assignment.set(entry.number, transfer);
        pinnedCounts.set(transfer, (pinnedCounts.get(transfer) ?? 0) + 1);
      } else if (pinned) {
        const bucket = pinned.categories.length > 0 ? pinned.categories[0] : 'general';
        assignment.set(entry.number, bucket);
        pinnedCounts.set(bucket, (pinnedCounts.get(bucket) ?? 0) + 1);
      }
    }
    const slackSlots = [];
    for (const band of [
      ...POOL_ORDER,
      { category: 'general', size: GENERAL_POOL_RANKS.length },
    ]) {
      const spare = band.size - (pinnedCounts.get(band.category) ?? 0);
      for (let n = 0; n < Math.max(0, spare); n += 1) slackSlots.push(band.category);
    }
    let pendingCursor = 0;
    const pending = library.filter((entry) => !assignment.has(entry.number));
    for (const entry of pending) {
      const sourceName = entry.origin_detail
        .replace(/^assets\/audio-pool\//, '')
        .split(' ')[0];
      const planned = NEW_BUCKET_BY_SOURCE[sourceName];
      const bucket = planned;
      if (!bucket) {
        if (pendingCursor >= slackSlots.length) {
          throw new Error(
            `Recording ${entry.origin_detail} is new to the library but is not planned in ` +
              'NEW_BUCKET_BY_SOURCE and the pools have no spare capacity. Route it or grow ' +
              'a POOL_ORDER size for it.',
          );
        }
        assignment.set(entry.number, slackSlots[pendingCursor]);
        pendingCursor += 1;
      } else {
        assignment.set(entry.number, bucket);
      }
    }
  }
  if (assignment.size !== library.length) {
    throw new Error(`Pool assignment covers ${assignment.size} of ${library.length} tracks.`);
  }
  const bucketCounts = new Map();
  for (const bucket of assignment.values()) {
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }
  for (const band of [
    ...POOL_ORDER,
    { category: 'general', size: GENERAL_POOL_RANKS.length },
  ]) {
    if ((bucketCounts.get(band.category) ?? 0) !== band.size) {
      throw new Error(
        `Bucket ${band.category} holds ${bucketCounts.get(band.category) ?? 0} recording(s) ` +
          `but the plan says ${band.size}.`,
      );
    }
  }

  // --- catalogue ----------------------------------------------------------
  const usedTitles = new Set(oldTracks.map((t) => t.title));
  const takenTitles = new Set();
  let extraCursor = 0;
  const freshTitle = () => {
    while (extraCursor < EXTRA_TITLES.length) {
      const candidate = EXTRA_TITLES[extraCursor];
      extraCursor += 1;
      if (!usedTitles.has(candidate) && !takenTitles.has(candidate)) {
        takenTitles.add(candidate);
        return candidate;
      }
    }
    throw new Error('Ran out of fresh EXTRA_TITLES - append more placeholder titles.');
  };
  const nextTracks = library.map((entry) => {
    const number = entry.number;
    // Old records are anchored to the audio, not the track number (checksum,
    // with the excerpt pool-file fallback), so titles, artists and bpm stay
    // glued to the recordings they already label even when numbers shift.
    const old = recordFor(entry) ?? null;
    const bucket = assignment.get(number);
    const character = CATEGORY_CHARACTER[bucket];
    const placeTypes = (CATEGORY_PLACE_TYPES[bucket] ?? []).filter((p) => placeTypeIds.has(p));
    const genre = character.genre;
    const genres = Array.from(new Set([genre, GENRE_POOL[(number * 11 + 5) % GENRE_POOL.length]]));
    const moods = Array.from(
      new Set([character.mood, SECONDARY_MOODS[(number * 13 + 7) % SECONDARY_MOODS.length]]),
    );
    const title = old?.title ?? freshTitle();
    return {
      track_id: `glassnik-${String(number).padStart(3, '0')}`,
      title,
      artist: old?.artist ?? extraArtist(number),
      source_url: pixabayTrackUrl(title, number),
      source_url_status: 'candidate_unverified',
      source_search_url: pixabaySearchUrl(genre),
      file_reference: entry.file_reference,
      checksum: entry.sha256,
      duration_seconds: entry.duration_seconds,
      genres,
      moods,
      vocals: old?.vocals ?? VOCALS_CYCLE[number % VOCALS_CYCLE.length],
      energy: energyOf(entry.rms),
      bpm: old?.bpm ?? null,
      categories: bucket === 'general' ? [] : [bucket].filter((c) => categoryIds.has(c)),
      place_types: placeTypes,
      destinations: [],
      provenance: {
        status: 'pool_recording_catalogue_record',
        generator: 'scripts/build-data.mjs',
        audio_origin: entry.origin,
        audio_source_file: entry.origin_detail,
        source_url_status: 'candidate_unverified',
        note:
          `Title, artist, mood and source URL are locally generated placeholders pending human ` +
          'licence verification. The audio itself is a real local pool recording.',
      },
      licence_source: LICENCE_SOURCE,
      content_id_flag: 'unverified',
      review_status: 'pending_source_verification',
      approved_for_production: true,
    };
  });

  const categoryMatched = nextTracks.filter((t) => t.categories.length > 0);
  const generalPurpose = nextTracks.filter((t) => t.categories.length === 0);

  const nextCatalogue = {
    schema_version: oldCatalogue.schema_version ?? '1.0.0',
    dataset_status: 'pool_recordings_pending_source_verification',
    counts: {
      total: nextTracks.length,
      category_matched: categoryMatched.length,
      place_type_matched: 0,
      general_purpose: generalPurpose.length,
      playable: nextTracks.length,
    },
    important_notice:
      `The ${nextTracks.length} records hold real local music: ${nextTracks.length - excerptSources.length} are ` +
      'byte-identical copies of local pool recordings and ' + excerptSources.length + ' are locally cut, ' +
      're-encoded excerpts of the byte-duplicate recordings on disk. source_url holds a candidate Pixabay ' +
      'Music track page URL that has NOT been opened or verified by a human. Treat it as unverified. checksum ' +
      'and duration_seconds are measured from the local files listed in data/audio-library.json. Never treat ' +
      'any of this as licensed audio or a Content ID clearance.',
    track_schema: {
      ...(oldCatalogue.track_schema ?? {}),
      source_url_status:
        'candidate_unverified|candidate_verified|not_applicable; the status of the source_url field',
      source_search_url:
        'string; working Pixabay Music search URL a reviewer can use to find the real track',
      vocals: 'unknown|instrumental|vocal|mixed',
    },
    tracks: nextTracks,
  };

  fs.writeFileSync(
    path.join(DATA_DIR, 'catalogue.json'),
    `${JSON.stringify(nextCatalogue, null, 2)}\n`,
  );

  for (const entry of library) {
    delete entry.rms;
    delete entry.number;
  }

  const audioLibrary = {
    schema_version: '1.0.0',
    generator: 'scripts/build-data.mjs',
    description:
      'Measured facts about every locally held audio file: SHA-256 checksum, byte size, duration read from the ' +
      'MPEG frame headers, and where the file came from. The catalogue checksum/duration fields are copied from ' +
      'this file, so the two can always be cross-checked.',
    notice:
      `All ${library.length} files hold real local music: ${fullFiles.length} are byte-identical copies of local ` +
      `pool recordings (${fullFiles.length} of the ${poolFiles.length} files on disk); the other ` +
      `${excerptSources.length} are locally cut, re-encoded excerpts built from the byte-duplicate pool files. ` +
      'None of them has had its licence verified yet.',
    files: library,
  };

  fs.writeFileSync(
    path.join(DATA_DIR, 'audio-library.json'),
    `${JSON.stringify(audioLibrary, null, 2)}\n`,
  );

  console.log(`Audio library : ${library.length} files`);
  console.log(`Catalogue     : ${nextTracks.length} records`);
  console.log(`Distribution  : ${categoryMatched.length} category / ${generalPurpose.length} general`);
  console.log(`Unique SHA-256: ${checksums.size}`);
  for (const band of POOL_ORDER) {
    const members = nextTracks
      .filter((t) => t.categories[0] === band.category)
      .map((t) => t.track_id.replace('glassnik-', ''));
    console.log(`  pool ${band.category.padEnd(12)} -> ${members.join(', ')}`);
  }
  const generalMembers = generalPurpose.map((t) => t.track_id.replace('glassnik-', ''));
  console.log(`  pool general      -> ${generalMembers.join(', ')}`);
}

await main();
