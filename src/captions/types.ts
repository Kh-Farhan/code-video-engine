/**
 * Caption data shapes. All frames are relative to the start of the scene
 * unless a function says otherwise.
 */

/** One spoken word. Same shape as a word-level transcription result. */
export type TimedWord = {
  text: string;
  startFrame: number;
  /** Exclusive. */
  endFrame: number;
};

/** What is on screen at once: 3 to 6 words plus their individual timings. */
export type CaptionChunk = {
  text: string;
  startFrame: number;
  /** Exclusive. */
  endFrame: number;
  words: TimedWord[];
};
