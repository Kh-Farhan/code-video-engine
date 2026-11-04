import type { Caption } from "@remotion/captions";
import type { TimedWord } from "../captions/types";

/**
 * Conversions between Remotion Caption objects (milliseconds) and the frame
 * based TimedWord the caption components use. Pure.
 */

/** Strips the leading space Remotion captions use between words. */
export const captionWordText = (c: Pick<Caption, "text">): string => c.text.trim();

/**
 * Captions to frame-timed words inside [0, audioDurationInFrames). Every word
 * keeps at least one frame, in order, so no script word is ever dropped from
 * the captions. Pauses between words are kept as gaps. If there are more
 * words than frames, frames are shared out evenly instead.
 */
export const captionsToTimedWords = (
  captions: readonly Caption[],
  fps: number,
  audioDurationInFrames: number,
): TimedWord[] => {
  const n = captions.length;
  if (n === 0) return [];
  const limit = Math.max(1, audioDurationInFrames);
  const toFrame = (ms: number) => Math.round((ms * fps) / 1000);
  if (n > limit) {
    return captions.map((c, i) => ({
      text: captionWordText(c),
      startFrame: Math.floor((i * limit) / n),
      endFrame: Math.max(Math.floor((i * limit) / n) + 1, Math.floor(((i + 1) * limit) / n)),
    }));
  }

  // Starts: strictly increasing and leaving room for one frame per later word.
  const starts = captions.map((c) => toFrame(c.startMs));
  for (let i = 0; i < n; i++) {
    starts[i] = Math.max(starts[i]!, i === 0 ? 0 : starts[i - 1]! + 1);
  }
  for (let i = n - 1; i >= 0; i--) {
    starts[i] = Math.min(starts[i]!, (i === n - 1 ? limit : starts[i + 1]!) - 1);
  }
  return captions.map((c, i) => {
    const next = i === n - 1 ? limit : starts[i + 1]!;
    const end = Math.min(next, Math.max(starts[i]! + 1, toFrame(c.endMs)));
    return { text: captionWordText(c), startFrame: starts[i]!, endFrame: end };
  });
};

/** Frame-timed words as Remotion captions (used for estimated timings). */
export const timedWordsToCaptions = (words: readonly TimedWord[], fps: number): Caption[] =>
  words.map((w, i) => ({
    text: i === 0 ? w.text : ` ${w.text}`,
    startMs: Math.round((w.startFrame * 1000) / fps),
    endMs: Math.round((w.endFrame * 1000) / fps),
    timestampMs: null,
    confidence: null,
  }));
