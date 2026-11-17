import { splitWords } from "../captions/text";
import { wordWeight } from "../captions/timing";
import { PAUSE_MARKER_MAX_MS } from "../schema/pauses";
import type { Pauses } from "../schema/script";
import { durationMs, msToSamples, type MonoPcm } from "./pcm";
import { ensureSentenceEnd } from "./sentences";
import { speechBounds, speechWindows, tightenPauses, type NarrationAudioOptions } from "./stitch";

/**
 * Breathing room for the continuous narration track. The pauses the TTS
 * makes at punctuation are kept; only pauses longer than `maxMs` are
 * shortened (to `shortenToMs`). Every comma, sentence end and scene
 * boundary then gets at least a minimum pause, padded with silence when the
 * voice ran on, and `[pause]` markers insert silence where punctuation
 * alone would not do it. Pure and deterministic.
 */

export const defaultPauses = {
  maxMs: 700,
  shortenToMs: 450,
  commaMs: 150,
  sentenceMs: 300,
  sceneMs: 350,
  markerMs: 300,
} as const;

export type PauseSettings = { [K in keyof typeof defaultPauses]: number };

/** The script's `style.pauses` with defaults filled in. shortenToMs never exceeds maxMs. */
export const resolvePauses = (pauses?: Pauses): PauseSettings => {
  const p = { ...defaultPauses, ...stripUndefined(pauses ?? {}) };
  return { ...p, shortenToMs: Math.min(p.shortenToMs, p.maxMs) };
};

const stripUndefined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** What a pause follows. A scene boundary is also a sentence end. */
export type BreakKind = "comma" | "sentence" | "scene";

export type Break = {
  kind?: BreakKind;
  /** Silence a marker asked for here, if any (markers in a row add up). */
  markerMs?: number;
  /** Least silence after this word. */
  minMs: number;
};

/** Scene narrations as one stream of caption words, with the pause owed after each. */
export type NarrationBreaks = {
  /** Caption words (markers stripped), all scenes in order. */
  words: string[];
  /** What is sent to the TTS for each word: a scene's last word gets a period if it has none. */
  spoken: string[];
  /** Scene index of each word. */
  scene: number[];
  /** Pause owed after each word; undefined after the last word of the script. */
  breaks: (Break | undefined)[];
};

const SENTENCE_END = /[.!?…]["')\]]*$/;
const CLAUSE_END = /[,;:]["')\]]*$/;
/** Abbreviations whose period does not end a sentence. */
const ABBREVIATION = /^["'(]*(e\.g|i\.e|vs|cf)\.$/i;

export const endsSentence = (word: string): boolean => SENTENCE_END.test(word) && !ABBREVIATION.test(word);
export const endsClause = (word: string): boolean => CLAUSE_END.test(word);

const MARKER = /\[\s*pause\s*(?::\s*(\d+)\s*(?:ms)?\s*)?\]/gi;

/**
 * Where the markers in one narration fall: after which caption word (index
 * into splitWords(narration), -1 before the first word) and how long.
 * Markers after the same word add up.
 */
export const pauseMarkerPositions = (
  narration: string,
  defaultMs: number = defaultPauses.markerMs,
): { afterWord: number; ms: number }[] => {
  const out: { afterWord: number; ms: number }[] = [];
  for (const m of narration.matchAll(MARKER)) {
    const afterWord = splitWords(narration.slice(0, m.index)).length - 1;
    const ms = Math.min(PAUSE_MARKER_MAX_MS, m[1] === undefined ? defaultMs : Number(m[1]));
    const prev = out.at(-1);
    if (prev && prev.afterWord === afterWord) prev.ms += ms;
    else out.push({ afterWord, ms });
  }
  return out;
};

/** Every scene's words and the pause owed after each word. */
export const narrationBreaks = (
  narrations: readonly string[],
  pauses: PauseSettings = defaultPauses,
): NarrationBreaks => {
  const out: NarrationBreaks = { words: [], spoken: [], scene: [], breaks: [] };
  const markerAfter = new Map<number, number>();
  narrations.forEach((narration, k) => {
    const first = out.words.length;
    const words = splitWords(narration);
    for (const { afterWord, ms } of pauseMarkerPositions(narration, pauses.markerMs)) {
      // A marker before a scene's first word is a pause after the previous scene.
      const g = first + afterWord;
      if (g >= 0) markerAfter.set(g, (markerAfter.get(g) ?? 0) + ms);
    }
    words.forEach((w, i) => {
      out.words.push(w);
      out.spoken.push(i === words.length - 1 ? ensureSentenceEnd(w) : w);
      out.scene.push(k);
    });
  });
  const n = out.words.length;
  out.breaks = out.words.map((w, g) => {
    if (g === n - 1) return undefined;
    const kind: BreakKind | undefined =
      out.scene[g + 1] !== out.scene[g] ? "scene" : endsSentence(w) ? "sentence" : endsClause(w) ? "comma" : undefined;
    const markerMs = markerAfter.get(g);
    const kindMs =
      kind === "scene" ? pauses.sceneMs : kind === "sentence" ? pauses.sentenceMs : kind === "comma" ? pauses.commaMs : 0;
    if (!kind && markerMs === undefined) return undefined;
    return { ...(kind ? { kind } : {}), ...(markerMs !== undefined ? { markerMs } : {}), minMs: Math.max(kindMs, markerMs ?? 0) };
  });
  return out;
};

/** One TTS request: words [from, to) of the stream. */
export type NarrationChunk = { from: number; to: number; text: string };

/**
 * Splits the stream into TTS requests. Always at markers (so the silence can
 * be inserted exactly there), and at sentence ends only when a provider
 * limits input length. Never inside a clause.
 */
export const planChunks = (b: NarrationBreaks, maxChars?: number): NarrationChunk[] => {
  const text = (from: number, to: number) => b.spoken.slice(from, to).join(" ");
  const pieces: [number, number][] = [];
  let start = 0;
  b.breaks.forEach((br, g) => {
    if (br?.markerMs !== undefined) {
      pieces.push([start, g + 1]);
      start = g + 1;
    }
  });
  if (start < b.words.length) pieces.push([start, b.words.length]);

  const chunks: NarrationChunk[] = [];
  for (const [from, to] of pieces) {
    if (maxChars === undefined || text(from, to).length <= maxChars) {
      chunks.push({ from, to, text: text(from, to) });
      continue;
    }
    // Pack whole sentences; a sentence longer than the limit stays whole.
    let at = from;
    let lastEnd = -1;
    for (let g = from; g < to; g++) {
      const sentenceEnd = g === to - 1 || b.breaks[g]?.kind === "sentence" || b.breaks[g]?.kind === "scene";
      if (!sentenceEnd) continue;
      if (lastEnd >= at && text(at, g + 1).length > maxChars) {
        chunks.push({ from: at, to: lastEnd + 1, text: text(at, lastEnd + 1) });
        at = lastEnd + 1;
      }
      lastEnd = g;
    }
    chunks.push({ from: at, to, text: text(at, to) });
  }
  return chunks;
};

/** Silence inserted into audio: `ms` at `atMs`. */
export type Insert = { atMs: number; ms: number };

/**
 * Maps a time before the inserts to after them. `side` decides a time
 * exactly at an insert: "before" stays in front of it (a word ending there),
 * "after" lands behind it (a word starting there).
 */
export type InsertMap = (ms: number, side?: "before" | "after") => number;

export const insertSilence = (pcm: MonoPcm, inserts: readonly Insert[]): { pcm: MonoPcm; map: InsertMap } => {
  const rate = pcm.sampleRate;
  const sorted = inserts
    .map((i) => ({
      at: Math.max(0, Math.min(pcm.samples.length, msToSamples(i.atMs, rate))),
      n: msToSamples(i.ms, rate),
      atMs: i.atMs,
    }))
    .filter((i) => i.n > 0)
    .sort((a, b) => a.at - b.at);
  const out = new Float32Array(pcm.samples.length + sorted.reduce((s, i) => s + i.n, 0));
  let from = 0;
  let to = 0;
  for (const i of sorted) {
    out.set(pcm.samples.subarray(from, i.at), to);
    to += i.at - from + i.n;
    from = i.at;
  }
  out.set(pcm.samples.subarray(from), to);
  // Compare against the requested times, so a word that ends or starts exactly at an
  // insert falls on the side asked for even though the insert is rounded to a sample.
  const atMs = sorted.map((i) => ({ at: i.atMs, ms: (i.n * 1000) / rate }));
  return {
    pcm: { sampleRate: rate, samples: out },
    map: (ms, side = "after") =>
      ms + atMs.reduce((s, i) => s + (i.at < ms || (side === "after" && i.at === ms) ? i.ms : 0), 0),
  };
};

/** A stretch of the chunk's final audio and which of its words are spoken in it. */
export type WordSpan = { from: number; to: number; startMs: number; endMs: number };

export type ShapedChunk = {
  pcm: MonoPcm;
  hasSpeech: boolean;
  /** Spans that cover every word of the chunk in order (indices relative to the chunk). */
  spans: WordSpan[];
  /** Silence before the first and after the last speech, ms. */
  leadMs: number;
  tailMs: number;
  /** Cut by trimming and shortening. */
  removedMs: number;
  pausesShortened: number;
  /** Pauses that were too short and got padded, and how much silence that added. */
  padded: number;
  paddedMs: number;
  /** Pauses owed inside the chunk whose place in the audio could not be found (left as spoken). */
  unplaced: number;
};

type Gap = { startMs: number; endMs: number };

/**
 * Processes one synthesized chunk: trims its edges, shortens only the pauses
 * longer than maxMs, then makes sure every comma, sentence end and scene
 * boundary inside it is followed by at least its minimum pause.
 *
 * Where a boundary is: at the edge of a provider sentence span when the
 * provider reported spans, else the silence nearest to where the words
 * before it should end (estimated by word length). Silent audio (mock) gets
 * the pause at the estimate. A boundary with no silence near it is left as
 * spoken rather than cutting a word.
 */
export const shapeChunk = (
  raw: MonoPcm,
  words: readonly string[],
  breaks: readonly (Break | undefined)[],
  segments: readonly { text: string; startMs: number; endMs: number }[] | undefined,
  pauses: PauseSettings = defaultPauses,
  audio: NarrationAudioOptions = {},
): ShapedChunk => {
  const tight = tightenPauses(raw, { ...audio, maxPauseMs: pauses.maxMs, targetPauseMs: pauses.shortenToMs });
  const pcm = tight.pcm;
  const total = durationMs(pcm);
  const bounds = tight.hasSpeech ? speechBounds(pcm, audio) : undefined;

  // Provider spans as word ranges, when their words line up with the chunk.
  const counts = segments?.map((s) => splitWords(s.text).length) ?? [];
  let spans: WordSpan[];
  if (segments?.length && counts.reduce((a, b) => a + b, 0) === words.length && counts.every((c) => c > 0)) {
    let w = 0;
    spans = segments.map((s, i) => {
      const startMs = Math.min(total, tight.map(s.startMs));
      const endMs = Math.min(total, tight.map(s.endMs));
      const speech = bounds?.(startMs, endMs);
      const span = { from: w, to: w + counts[i]!, ...(speech ?? { startMs, endMs }) };
      w += counts[i]!;
      return span;
    });
  } else {
    const speech = bounds?.(0, total);
    spans = [{ from: 0, to: words.length, ...(speech ?? { startMs: 0, endMs: total }) }];
  }

  // Silence runs between speech, for boundaries inside a span.
  const runs: Gap[] = [];
  if (tight.hasSpeech) {
    const { windowSamples, speech } = speechWindows(pcm, audio);
    const winMs = (windowSamples * 1000) / pcm.sampleRate;
    const first = speech.indexOf(true);
    const last = speech.lastIndexOf(true);
    for (let w = first; w <= last; ) {
      if (speech[w]) {
        w++;
        continue;
      }
      let end = w;
      while (end <= last && !speech[end]) end++;
      if ((end - w) * winMs >= MIN_RUN_MS) runs.push({ startMs: w * winMs, endMs: end * winMs });
      w = end;
    }
  }

  // Place boundaries: sentence ends first (they own the longer silences), then commas.
  const placed = new Map<number, Gap>();
  const owed = breaks
    .map((br, g) => ({ g, br }))
    .filter((x): x is { g: number; br: Break } => x.g < words.length - 1 && !!x.br && x.br.minMs > 0);
  const ordered = [
    ...owed.filter((x) => x.br.kind !== "comma"),
    ...owed.filter((x) => x.br.kind === "comma"),
  ];
  let unplaced = 0;
  for (const { g } of ordered) {
    const s = spans.findIndex((sp) => g >= sp.from && g < sp.to);
    const span = spans[s]!;
    if (g === span.to - 1) {
      // Between two provider spans: the gap is known.
      const next = spans[s + 1]!;
      placed.set(g, { startMs: span.endMs, endMs: Math.max(span.endMs, next.startMs) });
      continue;
    }
    const weights = words.slice(span.from, span.to).map(wordWeight);
    const before = weights.slice(0, g - span.from + 1).reduce((a, b) => a + b, 0);
    const estimate = span.startMs + ((span.endMs - span.startMs) * before) / weights.reduce((a, b) => a + b, 0);
    if (!tight.hasSpeech) {
      placed.set(g, { startMs: estimate, endMs: estimate });
      continue;
    }
    // Stay between the boundaries already placed on either side, and inside the span.
    let lo = span.startMs;
    let hi = span.endMs;
    for (const [h, gap] of placed) {
      if (h < g) lo = Math.max(lo, gap.endMs);
      if (h > g) hi = Math.min(hi, gap.startMs);
    }
    const radius = Math.max(SEARCH_RADIUS_MS, 0.2 * (span.endMs - span.startMs));
    let best: Gap | undefined;
    let bestScore = -Infinity;
    for (const run of runs) {
      if (run.startMs < lo || run.endMs > hi) continue;
      const distance = run.endMs < estimate ? estimate - run.endMs : run.startMs > estimate ? run.startMs - estimate : 0;
      if (distance > radius) continue;
      const score = run.endMs - run.startMs - 0.5 * distance;
      if (score > bestScore) {
        bestScore = score;
        best = run;
      }
    }
    if (best) placed.set(g, best);
    else unplaced++;
  }

  // Pad every placed pause that is shorter than it should be, in its middle.
  const inserts: Insert[] = [];
  for (const [g, gap] of placed) {
    const short = breaks[g]!.minMs - (gap.endMs - gap.startMs);
    if (short > 0.5) inserts.push({ atMs: (gap.startMs + gap.endMs) / 2, ms: short });
  }
  const padded = insertSilence(pcm, inserts);
  const map = padded.map;

  // Word spans on the final audio: provider spans cut at every placed pause.
  const cuts = [...placed.keys()].sort((a, b) => a - b);
  const finalSpans: WordSpan[] = [];
  for (const span of spans) {
    let from = span.from;
    let startMs = span.startMs;
    for (const g of cuts) {
      if (g < span.from || g >= span.to - 1) continue;
      const gap = placed.get(g)!;
      finalSpans.push({ from, to: g + 1, startMs: map(startMs, "after"), endMs: map(gap.startMs, "before") });
      from = g + 1;
      startMs = gap.endMs;
    }
    finalSpans.push({ from, to: span.to, startMs: map(startMs, "after"), endMs: map(span.endMs, "before") });
  }

  const finalMs = durationMs(padded.pcm);
  const whole = tight.hasSpeech ? speechBounds(padded.pcm, audio)(0, finalMs) : undefined;
  return {
    pcm: padded.pcm,
    hasSpeech: tight.hasSpeech,
    spans: finalSpans,
    leadMs: whole?.startMs ?? 0,
    tailMs: whole ? finalMs - whole.endMs : 0,
    removedMs: tight.removedMs,
    pausesShortened: tight.pausesShortened,
    padded: inserts.length,
    paddedMs: inserts.reduce((s, i) => s + i.ms, 0),
    unplaced,
  };
};

/** Silence shorter than this inside a span is a consonant, not a pause. */
const MIN_RUN_MS = 30;
/** How far from the estimated word end a boundary's silence may be. */
const SEARCH_RADIUS_MS = 350;

/**
 * Silence to put between two chunks so the pause after the first one's last
 * word is at least `minMs`, counting the quiet already at their edges.
 */
export const joinGapMs = (minMs: number, tailMs: number, leadMs: number): number =>
  Math.max(0, minMs - tailMs - leadMs);
