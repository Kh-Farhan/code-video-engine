import { Easing, interpolate } from "remotion";
import type { LineRange } from "../schema/script";

/**
 * Pure timing helpers for the code visuals. Everything is a function of the
 * current frame, so renders are deterministic.
 */

/** Typing finishes at this fraction of the scene so the viewer has time to read. */
export const TYPING_FINISH_FRACTION = 0.6;

/** Length of the move from one highlight step to the next. */
export const HIGHLIGHT_TRANSITION_SECONDS = 0.4;

/** Frame (relative to the scene) at which the last character appears. */
export const typingEndFrame = (
  durationInFrames: number,
  finishFraction: number = TYPING_FINISH_FRACTION,
): number => Math.max(1, Math.round(durationInFrames * finishFraction));

/** How many characters of the code are visible at `frame`. Newlines count as one character. */
export const visibleCharCount = (
  frame: number,
  totalChars: number,
  durationInFrames: number,
  finishFraction: number = TYPING_FINISH_FRACTION,
): number => {
  if (totalChars <= 0 || frame <= 0) return 0;
  const end = typingEndFrame(durationInFrames, finishFraction);
  if (frame >= end) return totalChars;
  return Math.floor((totalChars * frame) / end);
};

/**
 * Index of the highlight step active at `frame`. The scene is split evenly
 * between the steps. Returns -1 when there are no steps.
 */
export const activeHighlightStep = (
  frame: number,
  durationInFrames: number,
  stepCount: number,
): number => {
  if (stepCount <= 0) return -1;
  const stepLength = durationInFrames / stepCount;
  const step = Math.floor(frame / stepLength);
  return Math.min(Math.max(step, 0), stepCount - 1);
};

export type HighlightFocus = {
  /** Active step index. */
  step: number;
  /** Top of the focus window, in rows from the top (0-based, may be fractional mid-move). */
  top: number;
  /** Bottom of the focus window, in rows (exclusive). */
  bottom: number;
  /** 0 to 1. How strongly the rest of the code is dimmed. */
  strength: number;
};

/**
 * Where the focus window sits at `frame`. `ranges` are 1-based inclusive row
 * ranges. The window starts on the whole code and eases into the first
 * range, then eases from each range to the next at the start of every step.
 */
export const highlightFocus = (
  frame: number,
  durationInFrames: number,
  ranges: readonly LineRange[],
  totalRows: number,
  transitionFrames: number,
): HighlightFocus => {
  const step = activeHighlightStep(frame, durationInFrames, ranges.length);
  const current = ranges[step];
  if (!current) return { step, top: 0, bottom: totalRows, strength: 0 };

  const stepLength = durationInFrames / ranges.length;
  const stepStart = step * stepLength;
  const moveLength = Math.max(1, Math.min(transitionFrames, stepLength / 2));
  const t = interpolate(frame, [stepStart, stepStart + moveLength], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const previous = ranges[step - 1];
  const fromTop = previous ? previous.from - 1 : 0;
  const fromBottom = previous ? previous.to : totalRows;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    step,
    top: lerp(fromTop, current.from - 1),
    bottom: lerp(fromBottom, current.to),
    strength: previous ? 1 : t,
  };
};
