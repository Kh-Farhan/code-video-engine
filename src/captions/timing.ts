import type { TimedWord } from "./types";

/** Spoken weight of a word: its letters and digits, at least 1. */
export const wordWeight = (word: string): number =>
  Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, "").length);

/**
 * Estimates word timings when no transcription exists: spreads
 * [startFrame, endFrame) over the words in proportion to their length.
 * Words are contiguous and every word gets at least one frame whenever the
 * span has at least as many frames as there are words.
 */
export const distributeWordTimings = (
  words: readonly string[],
  startFrame: number,
  endFrame: number,
): TimedWord[] => {
  if (words.length === 0) return [];
  const span = Math.max(0, endFrame - startFrame);
  const weights = words.map(wordWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  // Reserve one frame per word when possible so no word has zero length.
  const reserved = span >= words.length ? 1 : 0;
  const free = span - reserved * words.length;

  let cumulative = 0;
  let previous = startFrame;
  return words.map((text, i) => {
    cumulative += weights[i]!;
    const end =
      i === words.length - 1
        ? startFrame + span
        : startFrame +
          reserved * (i + 1) +
          Math.round((free * cumulative) / totalWeight);
    const word = { text, startFrame: previous, endFrame: end };
    previous = end;
    return word;
  });
};
