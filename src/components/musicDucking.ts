import type { Manifest } from "../schema/manifest";
import { musicTiming } from "../theme";

/**
 * Pure volume math for background music. The level is a function of the
 * frame only, so renders are deterministic.
 */

/** A span of the video where narration is speaking. Absolute frames, end exclusive. */
export type NarrationWindow = { startFrame: number; endFrame: number };

/**
 * Where narration speaks, on the video timeline: per scene, from its first
 * caption cue to its last. Cues cover the spoken audio only, never the
 * padding, so the gaps between windows are the pauses between scenes.
 */
export const narrationWindows = (manifest: Pick<Manifest, "scenes">): NarrationWindow[] => {
  let offset = 0;
  return manifest.scenes.flatMap((s) => {
    const start = offset;
    offset += s.durationInFrames;
    const { cues } = s.captions;
    if (cues.length === 0) return [];
    return [
      {
        startFrame: start + Math.min(...cues.map((c) => c.startFrame)),
        endFrame: start + Math.max(...cues.map((c) => c.endFrame)),
      },
    ];
  });
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Smoothstep, so ramps start and end gently instead of with a click. */
const ease = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const framesAt = (fps: number, seconds: number) => Math.round(fps * seconds);

/** Joins windows separated by fewer than `maxGap` frames. Input must be in order. */
export const bridgeShortPauses = (
  windows: readonly NarrationWindow[],
  maxGap: number,
): NarrationWindow[] =>
  windows.reduce<NarrationWindow[]>((out, w) => {
    const last = out[out.length - 1];
    if (last && w.startFrame - last.endFrame < maxGap) {
      out[out.length - 1] = { startFrame: last.startFrame, endFrame: Math.max(last.endFrame, w.endFrame) };
    } else {
      out.push({ ...w });
    }
    return out;
  }, []);

/**
 * 0 to 1: how far the music is ducked at `frame`. 1 while narration speaks
 * and through pauses shorter than `musicTiming.hold`.
 */
export const duckAmount = (
  frame: number,
  windows: readonly NarrationWindow[],
  fps: number,
): number => {
  const attack = framesAt(fps, musicTiming.attack);
  const release = framesAt(fps, musicTiming.release);
  let amount = 0;
  for (const { startFrame, endFrame } of bridgeShortPauses(windows, framesAt(fps, musicTiming.hold))) {
    if (frame >= startFrame && frame < endFrame) return 1;
    const d =
      frame < startFrame
        ? attack > 0 ? 1 - (startFrame - frame) / attack : 0
        : release > 0 ? 1 - (frame - endFrame + 1) / release : 0;
    amount = Math.max(amount, ease(d));
  }
  return amount;
};

export type MusicVolumeInput = {
  windows: readonly NarrationWindow[];
  /** Level when nobody is talking. */
  volume: number;
  /** Level under narration. */
  duckedVolume: number;
  durationInFrames: number;
  fps: number;
};

/**
 * Music volume at `frame` of the video: ducked under narration, faded in at
 * the start and out at the end.
 */
export const musicVolumeAt = (
  frame: number,
  { windows, volume, duckedVolume, durationInFrames, fps }: MusicVolumeInput,
): number => {
  const level = volume + (duckedVolume - volume) * duckAmount(frame, windows, fps);
  const fadeIn = framesAt(fps, musicTiming.fadeIn);
  const fadeOut = framesAt(fps, musicTiming.fadeOut);
  const fade = Math.min(
    fadeIn > 0 ? ease(frame / fadeIn) : 1,
    fadeOut > 0 ? ease((durationInFrames - 1 - frame) / fadeOut) : 1,
  );
  return level * fade;
};
