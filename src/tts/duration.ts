import { readFile } from "node:fs/promises";
import { TtsError } from "./types";

/**
 * Measures audio duration by parsing the file itself (no ffprobe needed).
 * Supports WAV (PCM) and MP3 (CBR and VBR), which is everything the
 * providers in this folder produce.
 */
export const measureAudioDuration = async (path: string): Promise<number> => {
  const bytes = new Uint8Array(await readFile(path));
  try {
    return audioDurationFromBytes(bytes);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new TtsError(`Could not measure duration of ${path}: ${reason}`);
  }
};

export const audioDurationFromBytes = (bytes: Uint8Array): number => {
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") {
    return wavDuration(bytes);
  }
  return mp3Duration(bytes);
};

const ascii = (b: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...b.subarray(offset, offset + length));

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

const wavDuration = (b: Uint8Array): number => {
  const v = view(b);
  let byteRate: number | undefined;
  let offset = 12;
  while (offset + 8 <= b.byteLength) {
    const id = ascii(b, offset, 4);
    const size = v.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (body + 16 > b.byteLength) throw new Error("truncated fmt chunk");
      byteRate = v.getUint32(body + 8, true);
    } else if (id === "data") {
      if (!byteRate) throw new Error("data chunk before fmt chunk");
      // Streaming writers sometimes leave the size as 0 or 0xFFFFFFFF.
      const available = b.byteLength - body;
      const dataSize = size === 0 || size === 0xffffffff ? available : Math.min(size, available);
      return dataSize / byteRate;
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV file has no data chunk");
};

// MPEG audio frame header tables. Index by [versionBits][layerBits].
// versionBits: 0 = MPEG 2.5, 2 = MPEG 2, 3 = MPEG 1. layerBits: 1 = III, 2 = II, 3 = I.
const BITRATES_KBPS = {
  v1l1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  v1l2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  v1l3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2l1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  v2l23: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
} as const;

const SAMPLE_RATES: Record<number, readonly number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

type FrameHeader = {
  frameLength: number;
  samples: number;
  sampleRate: number;
  /** Offset of the Xing/Info tag, if this frame carries one. */
  xingOffset: number;
};

export const parseMp3FrameHeader = (b: Uint8Array, i: number): FrameHeader | null => {
  if (i + 4 > b.byteLength) return null;
  const b1 = b[i + 1]!;
  const b2 = b[i + 2]!;
  const b3 = b[i + 3]!;
  if (b[i] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 3;
  const layer = (b1 >> 1) & 3;
  const bitrateIndex = (b2 >> 4) & 0xf;
  const rateIndex = (b2 >> 2) & 3;
  if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
    return null;
  }
  const mpeg1 = version === 3;
  const table =
    layer === 3
      ? mpeg1 ? BITRATES_KBPS.v1l1 : BITRATES_KBPS.v2l1
      : mpeg1
        ? layer === 2 ? BITRATES_KBPS.v1l2 : BITRATES_KBPS.v1l3
        : BITRATES_KBPS.v2l23;
  const bitrate = table[bitrateIndex]! * 1000;
  const sampleRate = SAMPLE_RATES[version]![rateIndex]!;
  const padding = (b2 >> 1) & 1;
  const samples = layer === 3 ? 384 : layer === 2 || mpeg1 ? 1152 : 576;
  const frameLength =
    layer === 3
      ? (Math.floor((12 * bitrate) / sampleRate) + padding) * 4
      : Math.floor(((samples / 8) * bitrate) / sampleRate) + padding;
  const mono = (b3 >> 6) === 3;
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17;
  return { frameLength, samples, sampleRate, xingOffset: i + 4 + sideInfo };
};

/** Skips an ID3v2 tag at the start of the file, returning the first audio byte. */
const skipId3v2 = (b: Uint8Array): number => {
  if (b.byteLength < 10 || ascii(b, 0, 3) !== "ID3") return 0;
  const size = ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
  const hasFooter = (b[5]! & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
};

const mp3Duration = (b: Uint8Array): number => {
  let i = skipId3v2(b);

  // Find the first frame whose successor is also a frame, to avoid false syncs.
  let first: FrameHeader | null = null;
  for (; i + 4 <= b.byteLength; i++) {
    const h = parseMp3FrameHeader(b, i);
    if (!h) continue;
    const next = i + h.frameLength;
    if (next === b.byteLength || parseMp3FrameHeader(b, next)) {
      first = h;
      break;
    }
  }
  if (!first) throw new Error("not a WAV or MP3 file (no MPEG audio frames found)");

  // VBR files carry the total frame count in a Xing/Info tag in the first frame.
  const tag = ascii(b, first.xingOffset, 4);
  if (tag === "Xing" || tag === "Info") {
    const flags = view(b).getUint32(first.xingOffset + 4);
    if (flags & 1) {
      const frames = view(b).getUint32(first.xingOffset + 8);
      return (frames * first.samples) / first.sampleRate;
    }
  }

  let seconds = 0;
  let isFirst = true;
  while (i + 4 <= b.byteLength) {
    const h = parseMp3FrameHeader(b, i);
    if (!h) {
      if (ascii(b, i, 3) === "TAG") break; // ID3v1 trailer
      i++; // resync
      continue;
    }
    // A Xing/Info frame without a frame count holds no audio.
    const isTagFrame = isFirst && (tag === "Xing" || tag === "Info");
    if (!isTagFrame) seconds += h.samples / h.sampleRate;
    isFirst = false;
    i += h.frameLength;
  }
  return seconds;
};
