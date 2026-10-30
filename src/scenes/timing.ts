/**
 * Pure timing helpers for scenes. No React, no Remotion runtime, so they are
 * easy to unit test. All values are in frames.
 */

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
