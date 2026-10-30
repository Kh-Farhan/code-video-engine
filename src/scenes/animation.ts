import type { CSSProperties } from "react";
import { interpolate, spring } from "remotion";
import { beats, framesAt } from "./timing";

/** Critically damped: settles without overshoot, reads calm on code videos. */
const SMOOTH = { damping: 200 } as const;
/** A touch of bounce for small accents (badges, bars). */
const SNAPPY = { damping: 14, stiffness: 160, mass: 0.6 } as const;

/** 0 to 1 entrance progress starting at `delay` frames. Deterministic. */
export const enter = (
  frame: number,
  fps: number,
  delay = 0,
  snappy = false,
): number =>
  spring({ frame, fps, delay, config: snappy ? SNAPPY : SMOOTH });

/** Style for content that rises and fades in as `progress` goes 0 to 1. */
export const riseIn = (progress: number, distance = 40): CSSProperties => ({
  opacity: interpolate(progress, [0, 1], [0, 1], { extrapolateRight: "clamp" }),
  transform: `translateY(${interpolate(progress, [0, 1], [distance, 0])}px)`,
});

/** 1 normally, easing to 0 by the scene's last frame. */
export const fadeOutAtEnd = (
  frame: number,
  fps: number,
  durationInFrames: number,
): number => {
  const length = Math.min(framesAt(fps, beats.fadeOut), Math.floor(durationInFrames / 4));
  if (length <= 0) return 1;
  return interpolate(
    frame,
    [durationInFrames - 1 - length, durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
};
