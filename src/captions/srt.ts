import type { CaptionChunk } from "./types";

export type SceneCaptions = {
  /** Full scene length including padding, so later scenes are offset correctly. */
  durationInFrames: number;
  /** Chunks with frames relative to the scene start. */
  chunks: readonly CaptionChunk[];
};

/** Places every scene's chunks on the video timeline (absolute frames). */
export const toVideoTimeline = (scenes: readonly SceneCaptions[]): CaptionChunk[] => {
  let offset = 0;
  return scenes.flatMap(({ durationInFrames, chunks }) => {
    const shifted = chunks.map((c) => ({
      ...c,
      startFrame: c.startFrame + offset,
      endFrame: c.endFrame + offset,
      words: c.words.map((w) => ({
        ...w,
        startFrame: w.startFrame + offset,
        endFrame: w.endFrame + offset,
      })),
    }));
    offset += durationInFrames;
    return shifted;
  });
};

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** SRT timestamp for a frame: HH:MM:SS,mmm. */
export const formatSrtTimestamp = (frame: number, fps: number): string => {
  const totalMs = Math.round((frame * 1000) / fps);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
};

/** SRT file contents for chunks on the video timeline (see toVideoTimeline). */
export const formatSrt = (chunks: readonly CaptionChunk[], fps: number): string =>
  chunks
    .filter((c) => c.endFrame > c.startFrame)
    .map(
      (c, i) =>
        `${i + 1}\n${formatSrtTimestamp(c.startFrame, fps)} --> ${formatSrtTimestamp(c.endFrame, fps)}\n${c.text}\n`,
    )
    .join("\n");

/** SRT for a whole video from its scenes. */
export const videoToSrt = (scenes: readonly SceneCaptions[], fps: number): string =>
  formatSrt(toVideoTimeline(scenes), fps);
