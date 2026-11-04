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
 * Frame at which each highlight step starts, relative to the highlight span.
 * A step with a cue frame starts exactly there; the steps between two known
 * starts (the span's start, a cued step, or the span's end) are spaced
 * evenly. With no cues this is the plain even split: step i at i * D / n.
 * Cue frames are clamped into the span and never go backwards.
 */
export const highlightStepStarts = (
  durationInFrames: number,
  stepCount: number,
  cueFrames: readonly (number | undefined)[] = [],
): number[] => {
  if (stepCount <= 0) return [];
  const known: (number | undefined)[] = Array.from({ length: stepCount }, (_, i) => {
    const cue = cueFrames[i];
    return cue === undefined ? undefined : Math.min(Math.max(cue, 0), durationInFrames);
  });
  if (known[0] === undefined) known[0] = 0;
  const starts: number[] = [];
  for (let i = 0; i < stepCount; ) {
    starts.push(Math.max(known[i]!, starts[i - 1] ?? 0));
    let next = i + 1;
    while (next < stepCount && known[next] === undefined) next++;
    const from = starts[i]!;
    const to = next < stepCount ? Math.max(known[next]!, from) : Math.max(durationInFrames, from);
    for (let k = i + 1; k < next; k++) starts.push(from + ((k - i) * (to - from)) / (next - i));
    i = next;
  }
  return starts;
};

/**
 * Index of the highlight step active at `frame`: the last step that has
 * started (step 0 before any has). Steps start at `starts`, or split the
 * scene evenly when no starts are given. Returns -1 when there are no steps.
 */
export const activeHighlightStep = (
  frame: number,
  durationInFrames: number,
  stepCount: number,
  starts: readonly number[] = highlightStepStarts(durationInFrames, stepCount),
): number => {
  if (stepCount <= 0) return -1;
  let step = 0;
  for (let i = 1; i < stepCount; i++) if (frame >= starts[i]!) step = i;
  return step;
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
 * `starts` (see highlightStepStarts) sets when each step begins; by default
 * the steps split the duration evenly. Before the first step starts, nothing
 * is highlighted.
 */
export const highlightFocus = (
  frame: number,
  durationInFrames: number,
  ranges: readonly LineRange[],
  totalRows: number,
  transitionFrames: number,
  starts: readonly number[] = highlightStepStarts(durationInFrames, ranges.length),
): HighlightFocus => {
  const step = activeHighlightStep(frame, durationInFrames, ranges.length, starts);
  const current = ranges[step];
  if (!current) return { step, top: 0, bottom: totalRows, strength: 0 };

  const stepStart = starts[step]!;
  const stepEnd = starts[step + 1] ?? Math.max(durationInFrames, stepStart);
  const stepLength = Math.max(0, stepEnd - stepStart);
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
