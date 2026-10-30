/**
 * Pure timing helpers for scenes. No React, no Remotion runtime, so they are
 * easy to unit test. All values are in frames.
 */

/**
 * Entrance delays and short transitions, in seconds. Components convert them
 * with `framesAt(fps, ...)` so they hold at any manifest fps.
 */
export const beats = {
  /** Gap before the element that follows a scene's first element. */
  follow: 0.1,
  /** Gap before a heading that follows an accent bar. */
  heading: 0.15,
  /** Gap before secondary text such as a subheading or a glow. */
  secondary: 0.4,
  /** How long an earlier list item takes to dim. */
  dim: 0.33,
  /** Fade at the end of every scene. */
  fadeOut: 0.25,
} as const;

/** Frames for a duration given in seconds at `fps`. */
export const framesAt = (fps: number, seconds: number): number =>
  Math.round(fps * seconds);

/**
 * Frame (relative to scene start) at which each list item appears.
 * The first item shows almost immediately, and the reveals are spread evenly
 * so the last one lands around 70% of the scene, leaving time to read it.
 */
export const listRevealFrames = (
  count: number,
  durationInFrames: number,
  fps: number,
): number[] => {
  if (count <= 0) return [];
  const lead = Math.min(framesAt(fps, 0.3), Math.floor(durationInFrames / 4));
  const lastAt = Math.max(lead, Math.floor(durationInFrames * 0.7));
  const step = count > 1 ? (lastAt - lead) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => Math.round(lead + i * step));
};

/** 0 to 1 progress through a video, safe for single-frame videos. */
export const videoProgress = (frame: number, durationInFrames: number): number =>
  durationInFrames <= 1
    ? 1
    : Math.min(1, Math.max(0, frame / (durationInFrames - 1)));
