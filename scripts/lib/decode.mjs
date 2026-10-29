/**
 * Local MP3 decoding and excerpt cutting.
 *
 * The prototype needs two demo files that are genuinely different from the
 * recordings they come from. Copying the file would not do (the old build
 * shipped two byte-for-byte copies), and cutting the MP3 frames by hand is
 * fragile: an MP3 frame can borrow audio data from earlier frames through the
 * bit reservoir, so a naive frame cut can produce a file that starts with
 * noise or does not decode at all.
 *
 * This module therefore decodes the recording locally with a WebAssembly
 * MPEG decoder, cuts the wanted part out of the decoded samples and lets the
 * build pipeline re-encode the result. Nothing is downloaded and nothing is
 * scraped: the audio stays inside the repository.
 */
import { MPEGDecoder } from 'mpg123-decoder';

/**
 * Decodes an MP3 buffer into plain PCM.
 *
 * @param {Buffer|Uint8Array} buffer the MP3 bytes
 * @returns {Promise<{sampleRate:number, channels:number, channelData:Float32Array[], samplesDecoded:number}>}
 */
export async function decodeMp3(buffer) {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const result = await decoder.decode(new Uint8Array(buffer));
    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `The MP3 file could not be decoded cleanly: ${result.errors
          .map((error) => error.message ?? String(error))
          .join('; ')}`,
      );
    }
    if (!result.samplesDecoded) {
      throw new Error('The MP3 file decoded to zero samples.');
    }
    return {
      sampleRate: result.sampleRate,
      channels: result.channelData.length,
      channelData: result.channelData,
      samplesDecoded: result.samplesDecoded,
    };
  } finally {
    decoder.free();
  }
}

/**
 * Cuts a time range out of decoded PCM.
 *
 * @param {Float32Array[]} channelData one array per channel
 * @param {number} sampleRate samples per second
 * @param {number} startSeconds where the excerpt starts
 * @param {number} endSeconds where the excerpt ends
 */
export function cutExcerpt(channelData, sampleRate, startSeconds, endSeconds) {
  const total = channelData[0]?.length ?? 0;
  const start = Math.min(total, Math.max(0, Math.round(startSeconds * sampleRate)));
  const end = Math.min(total, Math.max(start, Math.round(endSeconds * sampleRate)));
  if (end <= start) {
    throw new Error(
      `Cannot cut an empty excerpt (${startSeconds}s–${endSeconds}s of a ${(total / sampleRate).toFixed(2)}s recording).`,
    );
  }
  return {
    channelData: channelData.map((channel) => channel.slice(start, end)),
    sampleRate,
    startSeconds: start / sampleRate,
    endSeconds: end / sampleRate,
    durationSeconds: (end - start) / sampleRate,
  };
}

/** Converts floating point samples in -1..1 to 16 bit PCM. */
export function toInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}
