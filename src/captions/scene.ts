import type { CaptionCue, ManifestScene } from "../schema/manifest";
import { chunkWords, type ChunkOptions } from "./chunk";
import { sanitizeCaptionText, splitWords } from "./text";
import { distributeWordTimings } from "./timing";
import type { CaptionChunk, TimedWord } from "./types";

export type SceneCaptionInput = {
  narration: string;
  /** Length of the spoken audio (without scene padding). */
  audioDurationInFrames: number;
  /** Word timings from a transcription, if any. Used instead of estimating. */
  words?: readonly TimedWord[];
};

/** Word timings for a scene: real ones if given, else estimated from narration. */
export const sceneWordTimings = ({
  narration,
  audioDurationInFrames,
  words,
}: SceneCaptionInput): TimedWord[] =>
  words
    ? words
        .map((w) => ({ ...w, text: sanitizeCaptionText(w.text) }))
        .filter((w) => w.text.length > 0)
    : distributeWordTimings(splitWords(narration), 0, audioDurationInFrames);

/** Caption chunks for one scene, frames relative to the scene start. */
export const captionScene = (
  input: SceneCaptionInput,
  options?: ChunkOptions,
): CaptionChunk[] => chunkWords(sceneWordTimings(input), options);

/** Word timings as manifest cues (granularity "word"). Zero-length words are dropped. */
export const wordsToCues = (words: readonly TimedWord[]): CaptionCue[] =>
  words
    .filter((w) => w.endFrame > w.startFrame)
    .map(({ text, startFrame, endFrame }) => ({ text, startFrame, endFrame }));

/**
 * Turns a manifest scene's captions into chunks. Word cues are chunked
 * directly; sentence cues get word timings estimated inside each cue.
 */
export const chunksFromManifestCaptions = (
  captions: ManifestScene["captions"],
  options?: ChunkOptions,
): CaptionChunk[] => {
  const words =
    captions.granularity === "word"
      ? sceneWordTimings({ narration: "", audioDurationInFrames: 0, words: captions.cues })
      : captions.cues.flatMap((cue) =>
          distributeWordTimings(splitWords(cue.text), cue.startFrame, cue.endFrame),
        );
  return chunkWords(words, options);
};
