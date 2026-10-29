#!/usr/bin/env node
/**
 * Licence review register.
 *
 * Generates data/licence-review.csv - the spreadsheet the team keeps for
 * verifying usage rights on every held recording, one row per track.
 *
 * Every verification column starts as UNKNOWN and is meant to be filled in
 * by a human reviewer who opens the real source page for each track. No cell
 * may be guessed: if a licence does not explicitly cover the intended use,
 * the row stays flagged UNVERIFIED.
 *
 * The columns mirror the questions the music brief asks, per recording:
 *   - commercial use, hosting/streaming, continuous background playback
 *     alongside changing videos (not permanent embedding), redistribution /
 *     streaming / subscription restrictions, attribution requirements,
 *     content-identification risk, and any extra permissions needed,
 *   - plus who verified it, when, with which evidence.
 *
 * Usage: node scripts/licence-review-csv.mjs   (writes data/licence-review.csv)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const CATALOGUE = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'catalogue.json'), 'utf8'),
);

/** CSV quoting: wrap in quotes and double any inner quotes. */
function cell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

const HEADERS = [
  'track_id',
  'title',
  'title_note',
  'artist',
  'artist_note',
  'file_reference',
  'checksum_sha256',
  'duration_seconds',
  'audio_origin',
  'source_url_candidate',
  'source_url_status',
  'source_search_url',
  'licence_source_currently_recorded',
  'licence_type',
  'licence_url_verified',
  'commercial_use_permitted',
  'host_and_stream_permitted',
  'continuous_background_playback_permitted',
  'permanent_embedding_permitted',
  'standalone_distribution_permitted',
  'subscription_premium_use_permitted',
  'attribution_required',
  'attribution_method_notes',
  'content_id_claim_risk',
  'additional_permissions_required',
  'verified_by',
  'verified_date',
  'evidence_location',
  'review_status',
  'flag',
];

/** Questions a reviewer must answer, kept as a legend row set to UNKNOWN. */
const FILL_ME = 'UNKNOWN - reviewer must confirm from the actual licence text';

const rows = [HEADERS];
for (const track of CATALOGUE.tracks) {
  rows.push([
    track.track_id,
    track.title,
    'placeholder title - replace after source verification',
    track.artist,
    'placeholder artist - replace after source verification',
    track.file_reference,
    track.checksum,
    track.duration_seconds,
    track.provenance?.audio_origin ?? '',
    track.source_url ?? '',
    track.source_url_status ?? '',
    track.source_search_url ?? '',
    track.licence_source ?? '',
    FILL_ME,
    FILL_ME,
    FILL_ME, // commercial_use_permitted
    FILL_ME, // host_and_stream_permitted
    FILL_ME, // continuous_background_playback_permitted
    FILL_ME, // permanent_embedding_permitted
    FILL_ME, // standalone_distribution_permitted
    FILL_ME, // subscription_premium_use_permitted
    FILL_ME, // attribution_required
    '', // attribution_method_notes
    track.content_id_flag ?? 'unverified',
    FILL_ME, // additional_permissions_required
    '', // verified_by
    '', // verified_date
    '', // evidence_location
    track.review_status ?? '',
    'UNVERIFIED - do not use in production until every UNKNOWN is resolved',
  ]);
}

const csv = rows
  .map((row) => row.map(cell).join(','))
  .join('\r\n');

const target = path.join(ROOT, 'data', 'licence-review.csv');
fs.writeFileSync(target, `${csv}\r\n`);

console.log(
  `Licence review register : ${target} (${rows.length - 1} tracks, ${HEADERS.length} columns)`,
);
