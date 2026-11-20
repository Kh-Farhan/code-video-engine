import { durationMs, msToSamples, type MonoPcm } from "./pcm";

/**
 * Turns synthesized chunks into one continuous narration track: joins chunks
 * with a short silence, trims leading and trailing silence and shortens long
 * pauses. Every edit is recorded in a time map, so timings measured on the
 * raw audio (provider sentence marks) can be moved onto the final track.
 * Pure and deterministic.
 */

export const narrationAudio = {
  /** Silence between chunks when a provider needs the text split. */
  chunkGapMs: 120,
  /** Fade at each chunk edge into and out of that silence (the crossfade). */
  chunkFadeMs: 15,
  /** Pauses longer than this inside the narration are shortened... (style.pauses.maxMs) */
  maxPauseMs: 700,
  /** ...down to this. (style.pauses.shortenToMs) */
  targetPauseMs: 450,
  /** Kept before the first detected speech, so soft onsets are not clipped. */
  leadMs: 40,
  /**
   * The narration track's first speech must start within this of frame 0:
   * on a Short the hook has to be heard in the first second. Checked on the
   * final track (trimLeadingSilence), after every chunk is joined.
   */
  maxStartMs: 150,
  /** Kept after the last detected speech, so the last word can decay. */
  tailMs: 80,
  /** Fade applied at every cut, so splices never click. */
  spliceFadeMs: 5,
  /** Analysis window for speech detection. */
  windowMs: 10,
  /** A window is speech when its RMS is above this absolute level... */
  floorDb: -50,
  /** ...and above this level relative to the loudest window. */
  relativeDb: -40,
} as const;

export type NarrationAudioOptions = Partial<Record<keyof typeof narrationAudio, number>>;

const opts = (o: NarrationAudioOptions = {}) => ({ ...narrationAudio, ...o });

const fade = (s: Float32Array, from: number, length: number, direction: "in" | "out") => {
  const n = Math.min(length, s.length - from);
  for (let i = 0; i < n; i++) {
    const g = direction === "in" ? i / length : 1 - (i + 1) / length;
    s[from + i]! *= Math.max(0, g);
  }
};

export type JoinedAudio = {
  pcm: MonoPcm;
  /** Where each chunk starts in the joined audio, in ms. */
  offsetsMs: number[];
};

/**
 * Joins chunks with `chunkGapMs` of silence, fading each chunk out into the
 * gap and the next one in from it. All chunks must share a sample rate.
 */
export const joinChunks = (chunks: readonly MonoPcm[], options?: NarrationAudioOptions): JoinedAudio => {
  if (chunks.length === 0) throw new Error("no audio chunks to join");
  const { chunkGapMs, chunkFadeMs } = opts(options);
  const rate = chunks[0]!.sampleRate;
  if (chunks.some((c) => c.sampleRate !== rate)) {
    throw new Error(`audio chunks have different sample rates (${chunks.map((c) => c.sampleRate).join(", ")})`);
  }
  if (chunks.length === 1) return { pcm: { sampleRate: rate, samples: chunks[0]!.samples.slice() }, offsetsMs: [0] };
  const gap = msToSamples(chunkGapMs, rate);
  const fadeLength = msToSamples(chunkFadeMs, rate);
  const total = chunks.reduce((n, c) => n + c.samples.length, 0) + gap * (chunks.length - 1);
  const out = new Float32Array(total);
  const offsetsMs: number[] = [];
  let at = 0;
  chunks.forEach((c, i) => {
    const s = c.samples.slice();
    if (i > 0) fade(s, 0, Math.min(fadeLength, s.length), "in");
    if (i < chunks.length - 1) {
      const n = Math.min(fadeLength, s.length);
      fade(s, s.length - n, n, "out");
    }
    offsetsMs.push((at * 1000) / rate);
    out.set(s, at);
    at += s.length + (i < chunks.length - 1 ? gap : 0);
  });
  return { pcm: { sampleRate: rate, samples: out }, offsetsMs };
};

/** Speech or not, per analysis window. */
export const speechWindows = (
  { samples, sampleRate }: MonoPcm,
  options?: NarrationAudioOptions,
): { windowSamples: number; speech: boolean[] } => {
  const { windowMs, floorDb, relativeDb } = opts(options);
  const windowSamples = Math.max(1, msToSamples(windowMs, sampleRate));
  const rms: number[] = [];
  for (let start = 0; start < samples.length; start += windowSamples) {
    const end = Math.min(samples.length, start + windowSamples);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i]! * samples[i]!;
    rms.push(Math.sqrt(sum / (end - start)));
  }
  const peak = rms.reduce((m, r) => Math.max(m, r), 0);
  const threshold = Math.max(10 ** (floorDb / 20), peak * 10 ** (relativeDb / 20));
  return { windowSamples, speech: rms.map((r) => peak > 0 && r > threshold) };
};

/** A kept stretch of the source audio and where it lands in the output. Samples. */
type KeptSpan = { from: number; to: number; outFrom: number };

/** Maps a time in the source audio to the processed audio, in ms. Monotonic. */
export type TimeMap = (sourceMs: number) => number;

export type TightenedAudio = {
  pcm: MonoPcm;
  map: TimeMap;
  /** False when no speech was detected (e.g. mock audio). Then the audio is unchanged. */
  hasSpeech: boolean;
  /** How much was cut, in ms. */
  removedMs: number;
  /** Internal pauses that were shortened. */
  pausesShortened: number;
};

const makeMap = (spans: readonly KeptSpan[], rate: number, outLength: number): TimeMap => (ms) => {
  const t = (ms * rate) / 1000;
  for (const s of spans) {
    if (t < s.from) return (s.outFrom * 1000) / rate;
    if (t <= s.to) return ((s.outFrom + t - s.from) * 1000) / rate;
  }
  return (outLength * 1000) / rate;
};

/**
 * Trims silence before the first and after the last speech (keeping leadMs
 * and tailMs) and shortens every internal pause longer than maxPauseMs to
 * targetPauseMs, cutting from its middle. Audio with no detectable speech is
 * returned unchanged.
 */
export const tightenPauses = (pcm: MonoPcm, options?: NarrationAudioOptions): TightenedAudio => {
  const o = opts(options);
  const { sampleRate: rate, samples } = pcm;
  const { windowSamples, speech } = speechWindows(pcm, options);
  const first = speech.indexOf(true);
  if (first < 0) {
    return { pcm, map: (ms) => ms, hasSpeech: false, removedMs: 0, pausesShortened: 0 };
  }
  const last = speech.lastIndexOf(true);
  const speechStart = first * windowSamples;
  const speechEnd = Math.min(samples.length, (last + 1) * windowSamples);

  // Source ranges to keep, in order.
  const keep: { from: number; to: number }[] = [];
  let from = Math.max(0, speechStart - msToSamples(o.leadMs, rate));
  let pausesShortened = 0;
  const half = msToSamples(o.targetPauseMs / 2, rate);
  const maxPause = msToSamples(o.maxPauseMs, rate);
  for (let w = first; w <= last; ) {
    if (speech[w]) {
      w++;
      continue;
    }
    let end = w;
    while (end <= last && !speech[end]) end++;
    const a = w * windowSamples;
    const b = end * windowSamples;
    if (b - a > maxPause) {
      keep.push({ from, to: a + half });
      from = b - half;
      pausesShortened++;
    }
    w = end;
  }
  keep.push({ from, to: Math.min(samples.length, speechEnd + msToSamples(o.tailMs, rate)) });

  const outLength = keep.reduce((n, k) => n + (k.to - k.from), 0);
  const out = new Float32Array(outLength);
  const spliceFade = msToSamples(o.spliceFadeMs, rate);
  const spans: KeptSpan[] = [];
  let at = 0;
  keep.forEach((k, i) => {
    const piece = samples.slice(k.from, k.to);
    // Fade at every cut, including the trimmed start and end of the track.
    if (i > 0 || k.from > 0) fade(piece, 0, Math.min(spliceFade, piece.length), "in");
    if (i < keep.length - 1 || k.to < samples.length) {
      const n = Math.min(spliceFade, piece.length);
      fade(piece, piece.length - n, n, "out");
    }
    out.set(piece, at);
    spans.push({ from: k.from, to: k.to, outFrom: at });
    at += piece.length;
  });
  const result: MonoPcm = { sampleRate: rate, samples: out };
  return {
    pcm: result,
    map: makeMap(spans, rate, outLength),
    hasSpeech: true,
    removedMs: durationMs(pcm) - durationMs(result),
    pausesShortened,
  };
};

/**
 * Returns a lookup for the first and last speech inside [fromMs, toMs), in
 * ms, or undefined when the range holds no speech. Used to keep estimated
 * word timings off the silence at the edges of a sentence.
 */
export const speechBounds = (
  pcm: MonoPcm,
  options?: NarrationAudioOptions,
): ((fromMs: number, toMs: number) => { startMs: number; endMs: number } | undefined) => {
  const { windowSamples, speech } = speechWindows(pcm, options);
  const windowMs = (windowSamples * 1000) / pcm.sampleRate;
  return (fromMs, toMs) => {
    const firstWindow = Math.max(0, Math.floor(fromMs / windowMs));
    const lastWindow = Math.min(speech.length - 1, Math.ceil(toMs / windowMs) - 1);
    let start: number | undefined;
    let end: number | undefined;
    for (let w = firstWindow; w <= lastWindow; w++) {
      if (!speech[w]) continue;
      start ??= Math.max(fromMs, w * windowMs);
      end = Math.min(toMs, (w + 1) * windowMs);
    }
    return start === undefined || end === undefined ? undefined : { startMs: start, endMs: end };
  };
};

export type TrimmedStart = {
  pcm: MonoPcm;
  /** Where speech starts in the returned audio, in ms (0 for silent audio). */
  startMs: number;
  /** Cut from the start, in ms. Shift every timing on the track by this. */
  removedMs: number;
};

/**
 * Makes the track's first speech start within `maxStartMs` of the start by
 * cutting leading silence down to `leadMs` (with a short fade in at the
 * cut). Audio that already starts in time, or has no detectable speech
 * (mock), is returned unchanged.
 */
export const trimLeadingSilence = (pcm: MonoPcm, options?: NarrationAudioOptions): TrimmedStart => {
  const o = opts(options);
  const rate = pcm.sampleRate;
  const { windowSamples, speech } = speechWindows(pcm, options);
  const first = speech.indexOf(true);
  if (first < 0) return { pcm, startMs: 0, removedMs: 0 };
  const startMs = (first * windowSamples * 1000) / rate;
  if (startMs <= o.maxStartMs) return { pcm, startMs, removedMs: 0 };
  const cut = Math.max(0, first * windowSamples - msToSamples(Math.min(o.leadMs, o.maxStartMs), rate));
  const samples = pcm.samples.slice(cut);
  fade(samples, 0, Math.min(msToSamples(o.spliceFadeMs, rate), samples.length), "in");
  const removedMs = (cut * 1000) / rate;
  return { pcm: { sampleRate: rate, samples }, startMs: startMs - removedMs, removedMs };
};
