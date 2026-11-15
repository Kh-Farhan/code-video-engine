import { wrapPcmAsWav } from "./wav";

/**
 * Mono float PCM in memory, plus WAV decoding and encoding. Pure: no Node
 * APIs, so it is easy to test with synthetic signals.
 */

export type MonoPcm = {
  sampleRate: number;
  /** Samples in [-1, 1]. */
  samples: Float32Array;
};

/** Float samples in [-1, 1] to 16-bit little-endian PCM. */
export const floatToPcm16 = (samples: Float32Array): Uint8Array => {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  samples.forEach((s, i) => {
    const clamped = Math.max(-1, Math.min(1, s));
    view.setInt16(i * 2, Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff), true);
  });
  return out;
};

export const encodeWav = ({ samples, sampleRate }: MonoPcm): Uint8Array =>
  wrapPcmAsWav(floatToPcm16(samples), { sampleRate, channels: 1, bitsPerSample: 16 });

const ascii = (b: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...b.subarray(offset, offset + length));

export const isWav = (b: Uint8Array): boolean =>
  b.byteLength >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE";

/**
 * Decodes a PCM WAV (16-bit integer or 32-bit float, any channel count) to
 * mono floats. Channels are averaged.
 */
export const decodeWav = (b: Uint8Array): MonoPcm => {
  if (!isWav(b)) throw new Error("not a WAV file");
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let format: { tag: number; channels: number; sampleRate: number; bits: number } | undefined;
  let offset = 12;
  while (offset + 8 <= b.byteLength) {
    const id = ascii(b, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        tag: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format) throw new Error("data chunk before fmt chunk");
      const available = b.byteLength - body;
      const dataSize = size === 0 || size === 0xffffffff ? available : Math.min(size, available);
      const { tag, channels, sampleRate, bits } = format;
      // 0xfffe is WAVE_FORMAT_EXTENSIBLE; its sub-format is not checked, the bit depth decides.
      const float = tag === 3 || (tag === 0xfffe && bits === 32);
      if (!(tag === 1 || tag === 3 || tag === 0xfffe) || !(bits === 16 || (float && bits === 32))) {
        throw new Error(`unsupported WAV encoding (format ${tag}, ${bits}-bit)`);
      }
      const bytesPerSample = bits / 8;
      const frames = Math.floor(dataSize / (bytesPerSample * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          const at = body + (i * channels + c) * bytesPerSample;
          sum += float ? view.getFloat32(at, true) : view.getInt16(at, true) / 0x8000;
        }
        samples[i] = sum / channels;
      }
      return { sampleRate, samples };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV file has no data chunk");
};

export const durationMs = ({ samples, sampleRate }: MonoPcm): number =>
  (samples.length * 1000) / sampleRate;

export const msToSamples = (ms: number, sampleRate: number): number =>
  Math.round((ms * sampleRate) / 1000);
