import { splitWords } from "../captions/text";
import type { TimedWord } from "../captions/types";
import { normalizeForMatch } from "./normalize";

/**
 * Highlight cues: a code highlight step may name a word (or a short phrase)
 * from the narration, and the step starts when that word is spoken. Pure, so
 * the schema and the Remotion bundle can both use it.
 */

/**
 * Index of the first word at or after `fromIndex` where `cue` is spoken.
 * Matching ignores case and punctuation, so the cue "useEffect" finds
 * "useEffect," and "isArray" finds "isArray()". A cue of several words
 * matches the same words in a row. -1 if it is not there.
 */
export const findCueWord = (words: readonly string[], cue: string, fromIndex = 0): number => {
  const target = normalizeForMatch(cue);
  if (!target) return -1;
  for (let i = Math.max(0, fromIndex); i < words.length; i++) {
    let joined = "";
    for (let j = i; j < words.length; j++) {
      const norm = normalizeForMatch(words[j]!);
      if (!norm && j === i) break;
      joined += norm;
      if (joined === target) return i;
      if (!target.startsWith(joined)) break;
    }
  }
  return -1;
};

/**
 * Word index for every step's cue (undefined for steps without one). Each cue
 * is looked up after the previous cue, so a word said twice resolves to the
 * occurrence that belongs to its step. -1 when a cue is not found in order.
 */
export const cueWordIndices = (
  words: readonly string[],
  steps: readonly { cue?: string }[],
): (number | undefined)[] => {
  let from = 0;
  return steps.map((step) => {
    if (step.cue === undefined) return undefined;
    const index = findCueWord(words, step.cue, from);
    if (index >= 0) from = index + 1;
    return index;
  });
};

/** Problems with the cues of a code scene, for script validation. */
export const cueProblems = (
  narration: string,
  steps: readonly { cue?: string }[],
): { step: number; message: string }[] => {
  const words = splitWords(narration);
  const indices = cueWordIndices(words, steps);
  return steps.flatMap((step, i) => {
    if (step.cue === undefined || indices[i]! >= 0) return [];
    const anywhere = findCueWord(words, step.cue) >= 0;
    return [
      {
        step: i,
        message: anywhere
          ? `cue "${step.cue}" is not spoken after the previous step's cue; cues must follow the narration order`
          : `cue "${step.cue}" is not a word in this scene's narration`,
      },
    ];
  });
};

/**
 * Frame (relative to the scene) at which each cued step's word is spoken,
 * from the scene's word timings. Undefined for steps without a cue, or whose
 * cue cannot be found.
 */
export const resolveCueFrames = (
  steps: readonly { cue?: string }[],
  words: readonly TimedWord[],
): (number | undefined)[] => {
  const indices = cueWordIndices(
    words.map((w) => w.text),
    steps,
  );
  return indices.map((i) => (i === undefined || i < 0 ? undefined : words[i]!.startFrame));
};
