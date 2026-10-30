/** Minimal PCM WAV encoding (RIFF, 16-bit little-endian). */

export type PcmFormat = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};

/** Wraps raw PCM bytes in a 44-byte WAV header. */
export const wrapPcmAsWav = (pcm: Uint8Array, format: PcmFormat): Uint8Array => {
  const { sampleRate, channels, bitsPerSample } = format;
  const blockAlign = (channels * bitsPerSample) / 8;
  const out = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  out.set(pcm, 44);
  return out;
};

/** A silent mono 16-bit WAV of exactly `round(seconds * sampleRate)` samples. */
export const silentWav = (seconds: number, sampleRate = 16000): Uint8Array => {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  return wrapPcmAsWav(new Uint8Array(samples * 2), {
    sampleRate,
    channels: 1,
    bitsPerSample: 16,
  });
};
