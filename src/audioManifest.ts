/**
 * Audio file manifest.
 *
 * The list of MP3 files that really exist under `public/audio/` is read from
 * `data/audio-library.json`, the file written by the local build pipeline
 * (`scripts/build-data.mjs`). The browser cannot list a server directory, so
 * both the recommender and the validator use this manifest to detect catalogue
 * references whose file is missing.
 *
 * Every entry carries the facts that were measured on the file itself:
 * SHA-256 checksum, byte size, duration, sample rate, channels and where the
 * audio came from. Nothing is downloaded and nothing is scraped: the manifest
 * describes files that live in this repository.
 *
 * To add a track: drop the MP3 into `public/audio/`, then run
 * `npm run build:data` to rebuild the manifest and the catalogue.
 */
import audioLibraryJson from '../data/audio-library.json';

export interface AudioLibraryEntry {
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

interface AudioLibraryDocument {
  schema_version?: string;
  generator?: string;
  description?: string;
  notice?: string;
  files?: AudioLibraryEntry[];
}

const document = audioLibraryJson as unknown as AudioLibraryDocument;

/** Every audio file that exists under `public/audio/`, in file_reference order. */
export const AUDIO_LIBRARY: AudioLibraryEntry[] = Array.isArray(document.files)
  ? document.files
  : [];

/** Just the file references, e.g. "audio/track-1.mp3". */
export const AVAILABLE_AUDIO_FILES: string[] = AUDIO_LIBRARY.map(
  (entry) => entry.file_reference,
);

const BY_REFERENCE = new Map(AUDIO_LIBRARY.map((entry) => [entry.file_reference, entry]));

/** The measured facts of one audio file, or null when the file is unknown. */
export function audioLibraryEntry(fileReference: string | null | undefined): AudioLibraryEntry | null {
  if (!fileReference) return null;
  return BY_REFERENCE.get(fileReference.trim().replace(/^\/+/, '').replace(/^public\//, '')) ?? null;
}

/** The SHA-256 checksum of one audio file, or null when the file is unknown. */
export function checksumFor(fileReference: string | null | undefined): string | null {
  return audioLibraryEntry(fileReference)?.sha256 ?? null;
}

/** The measured duration of one audio file in seconds, or null when unknown. */
export function durationFor(fileReference: string | null | undefined): number | null {
  return audioLibraryEntry(fileReference)?.duration_seconds ?? null;
}

/**
 * Maps a catalogue `file_reference` (relative to public/) to the browser URL.
 * `audio/track-1.mp3` -> `/audio/track-1.mp3`.
 * Returns null for empty values or values that do not map to an available file.
 */
export function toAudioUrl(
  fileReference: string | null | undefined,
  available: string[] = AVAILABLE_AUDIO_FILES,
): string | null {
  if (!fileReference) return null;
  const trimmed = fileReference.trim().replace(/^\/+/, '').replace(/^public\//, '');
  if (!trimmed.toLowerCase().endsWith('.mp3')) return null;
  if (!available.includes(trimmed)) return null;
  return `/${trimmed}`;
}
