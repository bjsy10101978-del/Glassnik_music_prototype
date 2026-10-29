/**
 * Minimal MPEG audio (Layer III) frame reader.
 *
 * This is a dependency-free reader used by the local audio build pipeline
 * (`scripts/build-data.mjs`) and by the verification tests. It exists so the
 * project can measure real durations straight from the file headers, without
 * downloading anything and without an external decoder.
 *
 * Cutting a recording apart is NOT done here: an MP3 frame can borrow audio
 * data from earlier frames (the bit reservoir), so a frame-level cut can
 * start with noise. `scripts/lib/decode.mjs` decodes the recording first and
 * cuts the decoded samples instead.
 *
 * Scope: MPEG-1 / MPEG-2 / MPEG-2.5 Layer III (MP3) only. MPEG-1 Layer I/II
 * and AAC are not decoded — the reader simply reports "no frames found" for
 * them.
 *
 * References for the tables below: ISO/IEC 11172-3 (MPEG-1) and
 * ISO/IEC 13818-3 (MPEG-2) frame layout.
 */

/** Layer III bitrates in kbit/s. Index 0 = free, index 15 = invalid. */
const BITRATES_MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

/** Sample rates in Hz, keyed by the 2-bit "version id" field. */
const SAMPLE_RATES = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

/**
 * Decodes an MPEG audio frame header.
 * Returns null when the four bytes at `offset` are not a valid header.
 */
function decodeHeader(buffer, offset) {
  if (offset + 4 > buffer.length) return null;
  const b0 = buffer[offset];
  const b1 = buffer[offset + 1];
  const b2 = buffer[offset + 2];
  const b3 = buffer[offset + 3];

  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;

  const versionId = (b1 >> 3) & 0x03; // 0 = 2.5, 1 = reserved, 2 = 2, 3 = 1
  const layerId = (b1 >> 1) & 0x03; // 0 = reserved, 1 = III, 2 = II, 3 = I
  if (versionId === 1 || layerId === 0) return null;
  if (layerId !== 1) return null; // this reader only understands Layer III

  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15) return null;
  if (sampleRateIndex === 3) return null;

  const padding = (b2 >> 1) & 0x01;
  const channelMode = (b3 >> 6) & 0x03;
  const hasCrc = (b1 & 0x01) === 0;

  const version = versionId === 3 ? 1 : versionId === 2 ? 2 : 2.5;
  const bitrateKbps =
    version === 1 ? BITRATES_MPEG1_L3[bitrateIndex] : BITRATES_MPEG2_L3[bitrateIndex];
  const sampleRate = SAMPLE_RATES[versionId][sampleRateIndex];
  const channels = channelMode === 3 ? 1 : 2;
  const samplesPerFrame = version === 1 ? 1152 : 576;
  const frameLength =
    Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate) + padding;

  return {
    version,
    layer: layerId,
    bitrateKbps,
    sampleRate,
    channels,
    channelMode,
    samplesPerFrame,
    frameLength,
    hasCrc,
    sideInfoOffset: offset + 4 + (hasCrc ? 2 : 0),
    sideInfoSize: version === 1 ? (channels === 1 ? 17 : 32) : channels === 1 ? 9 : 17,
  };
}

/**
 * Reads the 9-bit `main_data_begin` field from a frame's side information.
 *
 * `main_data_begin` is the number of bytes the frame borrows from the bit
 * reservoir of previous frames. A frame with `main_data_begin === 0` is
 * self-contained, so it is a safe place to start a new MP3 stream.
 */function readMainDataBegin(buffer, header) {
  const at = header.sideInfoOffset;
  if (at + 2 > buffer.length) return 0;
  return ((buffer[at] << 1) | (buffer[at + 1] >> 7)) & 0x1ff;
}

/**
 * Scans a buffer for the first valid MPEG Layer III frame header.
 * Returns the byte offset or -1.
 */
export function findFirstFrame(buffer) {
  for (let offset = 0; offset + 4 <= buffer.length; offset += 1) {
    if (buffer[offset] !== 0xff) continue;
    const header = decodeHeader(buffer, offset);
    if (header) return offset;
  }
  return -1;
}

/**
 * Walks every frame in an MP3 buffer.
 *
 * @returns {{
 *   frames: Array<{index:number,offset:number,length:number,startSeconds:number,endSeconds:number,mainDataBegin:number,sampleRate:number,channels:number,bitrateKbps:number}>,
 *   sampleRate: number,
 *   channels: number,
 *   bitrateKbps: number,
 *   durationSeconds: number,
 *   valid: boolean,
 *   error: string|null,
 * }}
 */
export function parseMp3(buffer) {
  const start = findFirstFrame(buffer);
  if (start === -1) {
    return {
      frames: [],
      sampleRate: 0,
      channels: 0,
      bitrateKbps: 0,
      durationSeconds: 0,
      valid: false,
      error: 'No MPEG Layer III frame header found.',
    };
  }

  const frames = [];
  let offset = start;
  let elapsed = 0;
  let first = null;

  while (offset + 4 <= buffer.length) {
    const header = decodeHeader(buffer, offset);
    if (!header) break;
    if (offset + header.frameLength > buffer.length) break;

    if (!first) first = header;
    const frameSeconds = header.samplesPerFrame / header.sampleRate;
    frames.push({
      index: frames.length,
      offset,
      length: header.frameLength,
      startSeconds: elapsed,
      endSeconds: elapsed + frameSeconds,
      mainDataBegin: readMainDataBegin(buffer, header),
      sampleRate: header.sampleRate,
      channels: header.channels,
      bitrateKbps: header.bitrateKbps,
    });
    elapsed += frameSeconds;
    offset += header.frameLength;
  }

  if (frames.length === 0) {
    return {
      frames: [],
      sampleRate: 0,
      channels: 0,
      bitrateKbps: 0,
      durationSeconds: 0,
      valid: false,
      error: 'Frame header found but no complete frames could be read.',
    };
  }

  return {
    frames,
    sampleRate: first.sampleRate,
    channels: first.channels,
    bitrateKbps: first.bitrateKbps,
    durationSeconds: elapsed,
    valid: true,
    error: null,
  };
}
