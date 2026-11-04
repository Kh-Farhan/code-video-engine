import type { Caption } from "@remotion/captions";
import { splitWords } from "../captions/text";
import { normalizeForMatch } from "./normalize";

/**
 * Aligns transcribed words (timing only) to the script's own words (the text
 * that is shown). Both sides are reduced to their spoken letters and aligned
 * character by character with an edit distance, so a word Whisper splits
 * ("use Effect"), joins ("isArray") or spells a little differently still
 * lands on the right script word. Pure: no Node APIs.
 */

/** A transcribed word with its time span in milliseconds. */
export type HeardWord = {
  text: string;
  startMs: number;
  endMs: number;
  /** Whisper's DTW timestamp for the word, if it produced one. */
  timestampMs?: number | null;
  confidence?: number | null;
};

export type AlignmentResult = {
  /** One caption per script word, with the script's exact text. */
  captions: Caption[];
  /** Share of the script's spoken characters that matched a heard character exactly. */
  matchRatio: number;
};

export class AlignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlignmentError";
  }
}

/**
 * Below this match ratio the transcription is treated as unrelated to the
 * script (wrong audio, silence, hallucination) and alignment fails.
 */
export const MIN_MATCH_RATIO = 0.6;

type HeardChar = { char: string; word: number; index: number; length: number };

/**
 * Edit costs. A gap or a wrong letter costs 2; pairing the first letter of a
 * word with a letter in the middle of a word (on the other side) costs 1
 * extra, so among equally good alignments the one that keeps word starts
 * together wins ("so 1,000" against "so a thousand" puts "1,000" on "a").
 */
const GAP = 2;
const MISMATCH = 2;
const BOUNDARY = 1;

const DIAGONAL = 0;
const UP = 1; // script char with no heard char
const LEFT = 2; // heard char with no script char

/**
 * Times every script word from the heard words. Throws AlignmentError when
 * there is nothing to align or the two texts do not match well enough.
 */
export const alignToScript = (
  narration: string,
  heard: readonly HeardWord[],
  { minMatchRatio = MIN_MATCH_RATIO }: { minMatchRatio?: number } = {},
): AlignmentResult => {
  const scriptWords = splitWords(narration);
  if (scriptWords.length === 0) return { captions: [], matchRatio: 1 };

  const scriptChars: { char: string; word: number; first: boolean }[] = [];
  scriptWords.forEach((w, word) => {
    [...normalizeForMatch(w)].forEach((char, i) => scriptChars.push({ char, word, first: i === 0 }));
  });
  const heardChars: HeardChar[] = [];
  heard.forEach((w, word) => {
    const norm = [...normalizeForMatch(w.text)];
    norm.forEach((char, index) => heardChars.push({ char, word, index, length: norm.length }));
  });
  if (heardChars.length === 0) throw new AlignmentError("the transcription has no words");
  if (scriptChars.length === 0) throw new AlignmentError("the narration has no spoken words");

  // Levenshtein over characters with a traceback.
  const n = scriptChars.length;
  const m = heardChars.length;
  const trace = new Uint8Array((n + 1) * (m + 1));
  let prev = new Uint32Array(m + 1);
  let cur = new Uint32Array(m + 1);
  for (let j = 0; j <= m; j++) {
    prev[j] = j * GAP;
    trace[j] = LEFT;
  }
  for (let i = 1; i <= n; i++) {
    cur[0] = i * GAP;
    trace[i * (m + 1)] = UP;
    const a = scriptChars[i - 1]!;
    for (let j = 1; j <= m; j++) {
      const b = heardChars[j - 1]!;
      const diag =
        prev[j - 1]! + (a.char === b.char ? 0 : MISMATCH) + (a.first !== (b.index === 0) ? BOUNDARY : 0);
      const up = prev[j]! + GAP;
      const left = cur[j - 1]! + GAP;
      let best = diag;
      let dir = DIAGONAL;
      if (up < best) {
        best = up;
        dir = UP;
      }
      if (left < best) {
        best = left;
        dir = LEFT;
      }
      cur[j] = best;
      trace[i * (m + 1) + j] = dir;
    }
    [prev, cur] = [cur, prev];
  }

  // Walk back: which heard char (if any) each script char lines up with.
  const pairedWith = new Int32Array(n).fill(-1);
  let matches = 0;
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const dir = i === 0 ? LEFT : j === 0 ? UP : trace[i * (m + 1) + j]!;
    if (dir === DIAGONAL) {
      pairedWith[i - 1] = j - 1;
      if (scriptChars[i - 1]!.char === heardChars[j - 1]!.char) matches++;
      i--;
      j--;
    } else if (dir === UP) {
      i--;
    } else {
      j--;
    }
  }
  const matchRatio = matches / n;
  if (matchRatio < minMatchRatio) {
    throw new AlignmentError(
      `the transcription does not match the narration (${Math.round(matchRatio * 100)}% of letters matched, need ${Math.round(minMatchRatio * 100)}%)`,
    );
  }

  // Time of a heard char's start (edge 0) or end (edge 1), interpolated
  // across its word by letter position.
  const charTime = (c: HeardChar, edge: 0 | 1): number => {
    const w = heard[c.word]!;
    return w.startMs + ((w.endMs - w.startMs) * (c.index + edge)) / c.length;
  };

  type Span = { start: number; end: number; heardWords: Set<number> } | undefined;
  const spans: Span[] = scriptWords.map(() => undefined);
  scriptChars.forEach(({ word }, i) => {
    const j = pairedWith[i]!;
    if (j < 0) return;
    const c = heardChars[j]!;
    const span = spans[word];
    if (!span) spans[word] = { start: charTime(c, 0), end: charTime(c, 1), heardWords: new Set([c.word]) };
    else {
      span.end = charTime(c, 1);
      span.heardWords.add(c.word);
    }
  });

  const timed = fillGaps(spans.map((s) => (s ? { start: s.start, end: s.end } : undefined)), heard);
  const captions = scriptWords.map((text, k): Caption => {
    const span = spans[k];
    const firstHeard = span ? heard[Math.min(...span.heardWords)] : undefined;
    const confidences = span
      ? [...span.heardWords].map((h) => heard[h]!.confidence).filter((p): p is number => typeof p === "number")
      : [];
    return {
      text: k === 0 ? text : ` ${text}`,
      startMs: Math.round(timed[k]!.start),
      endMs: Math.round(timed[k]!.end),
      // Whisper's DTW time only belongs to the script word that starts that heard word.
      timestampMs:
        firstHeard && firstHeard.timestampMs != null && span!.start === firstHeard.startMs
          ? firstHeard.timestampMs
          : null,
      confidence: confidences.length > 0 ? Math.min(...confidences) : null,
    };
  });
  return { captions, matchRatio };
};

/**
 * Script words that matched nothing (symbols like "=>", or words Whisper
 * dropped) share the gap between their timed neighbours evenly.
 */
const fillGaps = (
  spans: ({ start: number; end: number } | undefined)[],
  heard: readonly HeardWord[],
): { start: number; end: number }[] => {
  const audioStart = heard[0]?.startMs ?? 0;
  const audioEnd = heard[heard.length - 1]?.endMs ?? audioStart;
  const out: { start: number; end: number }[] = [];
  for (let k = 0; k < spans.length; ) {
    const span = spans[k];
    if (span) {
      out.push({ start: span.start, end: Math.max(span.start, span.end) });
      k++;
      continue;
    }
    let next = k;
    while (next < spans.length && !spans[next]) next++;
    const from = out[out.length - 1]?.end ?? audioStart;
    const to = spans[next]?.start ?? audioEnd;
    const count = next - k;
    const step = Math.max(0, to - from) / count;
    for (let i = 0; i < count; i++) out.push({ start: from + i * step, end: from + (i + 1) * step });
    k = next;
  }
  return out;
};
