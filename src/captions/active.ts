import type { CaptionChunk, TimedWord } from "./types";

/** The chunk being spoken at `frame`, if any. */
export const activeChunkAt = (
  chunks: readonly CaptionChunk[],
  frame: number,
): CaptionChunk | undefined =>
  chunks.find((c) => frame >= c.startFrame && frame < c.endFrame);

/** Index of the word being spoken at `frame` within a chunk, or -1. */
export const activeWordIndexAt = (words: readonly TimedWord[], frame: number): number =>
  words.findIndex((w) => frame >= w.startFrame && frame < w.endFrame);
