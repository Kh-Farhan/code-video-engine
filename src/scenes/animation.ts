import type { CSSProperties } from "react";
import { Easing, interpolate, spring } from "remotion";
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

/**
 * Splits `text` into words that rise in one after another, starting at
 * `delay` frames. Returns the frame at which the last word starts too, so
 * whatever follows can wait for it.
 */
export const staggeredWords = (
  text: string,
  frame: number,
  fps: number,
  delay: number,
  distance = 50,
): { words: { word: string; style: CSSProperties }[]; lastStart: number } => {
  const step = framesAt(fps, beats.wordStagger);
  const words = text.split(/\s+/).filter(Boolean);
  return {
    words: words.map((word, i) => ({
      word,
      style: { display: "inline-block", ...riseIn(enter(frame, fps, delay + i * step), distance) },
    })),
    lastStart: delay + Math.max(0, words.length - 1) * step,
  };
};

/**
 * The scene change: content settles in from slightly zoomed and blurred,
 * and leaves by shrinking, lifting and blurring away. Both sides stay inside
 * the scene's own frames, so timings and audio are unchanged.
 */
export const sceneTransitionStyle = (
  frame: number,
  fps: number,
  durationInFrames: number,
): CSSProperties => {
  const inLength = Math.max(1, Math.min(framesAt(fps, beats.transitionIn), Math.floor(durationInFrames / 4)));
  const outLength = Math.max(1, Math.min(framesAt(fps, beats.transitionOut), Math.floor(durationInFrames / 4)));
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const t = interpolate(frame, [0, inLength], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const end = durationInFrames - 1;
  const u = interpolate(frame, [end - outLength, end], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const scale = (1.06 - 0.06 * t) * (1 - 0.06 * u);
  const blur = 10 * (1 - t) + 10 * u;
  return {
    opacity: Math.min(t, 1 - u),
    transform: `translateY(${-40 * u}px) scale(${scale})`,
    filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
  };
};
