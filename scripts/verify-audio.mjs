#!/usr/bin/env node
/**
 * Checks the local audio library.
 *
 * Reads every MP3 in `public/audio/`, works out its real checksum, duration,
 * sample rate and channel count, and then checks the things that must be
 * true for the prototype:
 *
 *   1. every file is a readable MP3
 *   2. every file is different from every other file (no copies)
 *   3. every catalogue record that points at a file finds that file
 *   4. the recorded facts in `data/audio-library.json` match the files
 *
 * Nothing is downloaded and nothing is changed. Run it with:
 *
 *   npm run verify:audio
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { parseMp3 } from './lib/mp3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioDir = path.join(root, 'public', 'audio');
const libraryPath = path.join(root, 'data', 'audio-library.json');
const cataloguePath = path.join(root, 'data', 'catalogue.json');

const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

if (!fs.existsSync(audioDir)) {
  console.error(`Missing folder: ${audioDir}`);
  console.error('Run "npm run build:data" to create the audio files.');
  process.exit(1);
}

const files = fs
  .readdirSync(audioDir)
  .filter((name) => name.toLowerCase().endsWith('.mp3'))
  .sort();

if (files.length === 0) {
  console.error('No MP3 files found. Run "npm run build:data" first.');
  process.exit(1);
}

// ---- 1 + 2: read every file, look for duplicates -------------------------
const seenChecksums = new Map();
const measured = new Map();

for (const name of files) {
  const buffer = fs.readFileSync(path.join(audioDir, name));
  const checksum = createHash('sha256').update(buffer).digest('hex');
  const parsed = parseMp3(buffer);

  if (!parsed.valid) {
    fail(`${name}: not a readable MP3 (${parsed.error ?? 'unknown reason'})`);
    continue;
  }
  if (parsed.durationSeconds <= 0) {
    fail(`${name}: duration is ${parsed.durationSeconds.toFixed(3)}s`);
  }

  const previous = seenChecksums.get(checksum);
  if (previous) {
    fail(`${name} has the same bytes as ${previous} (duplicate file)`);
  } else {
    seenChecksums.set(checksum, name);
  }

  measured.set(name, {
    sha256: checksum,
    bytes: buffer.length,
    duration_seconds: Number(parsed.durationSeconds.toFixed(3)),
    sample_rate_hz: parsed.sampleRate,
    channels: parsed.channels,
    bitrate_kbps: parsed.bitrateKbps,
    frames: parsed.frames.length,
  });
}

// ---- 3: every catalogue reference finds its file -------------------------
const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
const tracks = Array.isArray(catalogue.tracks) ? catalogue.tracks : [];

for (const track of tracks) {
  if (!track.file_reference) continue;
  const name = path.basename(track.file_reference);
  if (!fs.existsSync(path.join(audioDir, name))) {
    fail(`Catalogue track ${track.track_id} points at ${track.file_reference}, which does not exist`);
  }
}

// ---- 4: the recorded facts match the files on disk ------------------------
if (fs.existsSync(libraryPath)) {
  const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
  const entries = Array.isArray(library.files) ? library.files : [];

  for (const entry of entries) {
    const name = path.basename(entry.file_reference ?? '');
    const facts = measured.get(name);
    if (!facts) {
      fail(`audio-library.json lists ${entry.file_reference}, but that file is missing`);
      continue;
    }
    if (entry.sha256 !== facts.sha256) {
      fail(`${name}: checksum in audio-library.json does not match the file`);
    }
    if (Math.abs((entry.duration_seconds ?? 0) - facts.duration_seconds) > 0.5) {
      fail(
        `${name}: duration in audio-library.json (${entry.duration_seconds}s) does not match the file (${facts.duration_seconds}s)`,
      );
    }
    if ((entry.bytes ?? 0) !== facts.bytes) {
      fail(`${name}: byte size in audio-library.json does not match the file`);
    }
  }

  for (const name of measured.keys()) {
    if (!entries.some((entry) => path.basename(entry.file_reference ?? '') === name)) {
      fail(`${name} exists on disk but is not listed in audio-library.json`);
    }
  }
} else {
  notes.push('data/audio-library.json is missing, so the recorded facts were not checked.');
}

// ---- report --------------------------------------------------------------
const durations = [...measured.values()].map((facts) => facts.duration_seconds);
const totalSeconds = durations.reduce((sum, value) => sum + value, 0);

console.log('Glassnik audio library check');
console.log('-----------------------------');
console.log(`Files on disk       : ${files.length}`);
console.log(`Readable MP3 files  : ${measured.size}`);
console.log(`Unique checksums    : ${seenChecksums.size}`);
console.log(
  `Shortest / longest  : ${Math.min(...durations).toFixed(1)}s / ${Math.max(...durations).toFixed(1)}s`,
);
console.log(`Total music         : ${(totalSeconds / 60).toFixed(1)} minutes`);
console.log(`Catalogue records   : ${tracks.length}`);
console.log(
  `With an audio file  : ${tracks.filter((track) => track.file_reference).length}`,
);

for (const note of notes) {
  console.log(`Note: ${note}`);
}

if (problems.length > 0) {
  console.log('');
  console.log(`FAILED with ${problems.length} problem(s):`);
  for (const problem of problems) {
    console.log(`  - ${problem}`);
  }
  process.exit(1);
}

console.log('');
console.log('OK - every file is a readable MP3, every file is different, and the catalogue matches.');
