import type { CaptionChunk, TimedWord } from "./types";

export type ChunkOptions = {
  minWords?: number;
  maxWords?: number;
};

export const DEFAULT_MIN_WORDS = 3;
export const DEFAULT_MAX_WORDS = 6;

/** Words after which a chunk may end early (end of a clause or sentence). */
const BREAK_AFTER = /[.,!?;:]["')\]]*$/;

const toChunk = (words: TimedWord[]): CaptionChunk => ({
  text: words.map((w) => w.text).join(" "),
  startFrame: words[0]!.startFrame,
  endFrame: words[words.length - 1]!.endFrame,
  words,
});

/**
 * Groups timed words into on-screen chunks of minWords..maxWords words.
 * Prefers to break at punctuation once a chunk has minWords. Only a text
 * with fewer than minWords words in total yields a shorter chunk.
 */
export const chunkWords = (
  words: readonly TimedWord[],
  { minWords = DEFAULT_MIN_WORDS, maxWords = DEFAULT_MAX_WORDS }: ChunkOptions = {},
): CaptionChunk[] => {
  if (minWords < 1 || maxWords < minWords * 2 - 1) {
    throw new Error(
      `invalid chunk sizes: min ${minWords}, max ${maxWords} (need 1 <= min and max >= 2 * min - 1)`,
    );
  }
  const groups: TimedWord[][] = [];
  let current: TimedWord[] = [];
  words.forEach((word, i) => {
    current.push(word);
    const remaining = words.length - i - 1;
    const full = current.length >= maxWords;
    const atBreak =
      current.length >= minWords &&
      BREAK_AFTER.test(word.text) &&
      (remaining === 0 || remaining >= minWords);
    if (full || atBreak) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length > 0) groups.push(current);

  // A short tail joins or rebalances with the group before it.
  const last = groups[groups.length - 1];
  const prev = groups[groups.length - 2];
  if (last && prev && last.length < minWords) {
    const merged = [...prev, ...last];
    groups.splice(-2, 2);
    if (merged.length <= maxWords) {
      groups.push(merged);
    } else {
      const head = Math.ceil(merged.length / 2);
      groups.push(merged.slice(0, head), merged.slice(head));
    }
  }
  return groups.map(toChunk);
};
