import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { captionsToTimedWords, timedWordsToCaptions } from "../align/frames";
import {
  sceneWordTimings,
  splitWords,
  wordsToCues,
  chunksFromManifestCaptions,
  videoToSrt,
  type TimedWord,
} from "../captions";
import {
  parseManifest,
  type Manifest,
  type ManifestMusic,
  type ManifestScene,
  type WordCaption,
} from "../schema/manifest";
import type { Music, Script } from "../schema/script";
import { beats, framesAt } from "../scenes/timing";
import {
  DEFAULT_CAPTION_STYLE,
  DEFAULT_LOOK,
  FPS,
  MUSIC_DUCKED_VOLUME,
  MUSIC_VOLUME,
  SCENE_PADDING_SECONDS,
} from "../theme";
import { CliError } from "./progress";
import type { SceneAudio } from "./voice";

/**
 * Combines the script, measured audio durations and caption timings into a
 * render manifest. Each scene lasts its audio (rounded up, so speech is never
 * cut off) plus SCENE_PADDING_SECONDS. Captions are word cues: aligned to the
 * audio when `voice` produced word timings, else spread over the spoken part
 * by word length. Either way they never run into the padding. Background
 * music, if any, gets its default levels filled in.
 */
export const buildManifest = (
  script: Script,
  slug: string,
  audio: readonly (Pick<SceneAudio, "audio" | "durationSeconds"> & Pick<Partial<SceneAudio>, "words">)[],
  fps = FPS,
): Manifest => {
  if (audio.length !== script.scenes.length) {
    throw new CliError(
      `Expected audio for ${script.scenes.length} scenes, got ${audio.length}.`,
    );
  }
  const padding = framesAt(fps, SCENE_PADDING_SECONDS);
  const manifest: Manifest = {
    version: 1,
    slug,
    title: script.title,
    fps,
    ...(script.music ? { music: resolveMusic(script.music) } : {}),
    style: {
      look: script.style?.look ?? DEFAULT_LOOK,
      captions: script.style?.captions ?? DEFAULT_CAPTION_STYLE,
    },
    ...(script.brand ? { brand: { handle: script.brand.handle } } : {}),
    scenes: script.scenes.map((scene, i) => {
      const { audio: file, durationSeconds, words: aligned } = audio[i]!;
      const audioDurationInFrames = Math.max(1, Math.ceil(durationSeconds * fps));
      const { words, timings } = sceneTimings(scene.narration, audioDurationInFrames, fps, aligned);
      return {
        scene,
        audio: file,
        durationInFrames: audioDurationInFrames + padding,
        captions: { granularity: "word", cues: wordsToCues(timings) },
        words,
      };
    }),
  };
  const parsed = parseManifest(manifest);
  if (!parsed.success) {
    throw new CliError(`Built an invalid manifest:\n  ${parsed.errors.join("\n  ")}`);
  }
  return parsed.data;
};

/**
 * Word timings for one scene: the aligned ones when they cover exactly the
 * narration's words, else the length-based estimate.
 */
export const sceneTimings = (
  narration: string,
  audioDurationInFrames: number,
  fps: number,
  aligned?: readonly WordCaption[],
): { words: NonNullable<ManifestScene["words"]>; timings: TimedWord[] } => {
  const scriptWords = splitWords(narration);
  const usable =
    aligned !== undefined &&
    aligned.length === scriptWords.length &&
    aligned.every((c, i) => c.text.trim() === scriptWords[i]);
  if (usable) {
    return {
      words: { source: "aligned", captions: [...aligned] },
      timings: captionsToTimedWords(aligned, fps, audioDurationInFrames),
    };
  }
  const timings = sceneWordTimings({ narration, audioDurationInFrames });
  return { words: { source: "estimated", captions: timedWordsToCaptions(timings, fps) }, timings };
};

/** Script music settings with defaults applied, as the manifest stores them. */
export const resolveMusic = ({ file, volume, duckedVolume }: Music): ManifestMusic => {
  const level = volume ?? MUSIC_VOLUME;
  return {
    src: file,
    volume: level,
    // Never louder under narration than without it.
    duckedVolume: Math.min(level, duckedVolume ?? MUSIC_DUCKED_VOLUME),
  };
};

/** SRT for the whole video, using the same chunking as the on-screen captions. */
export const manifestToSrt = (manifest: Manifest): string =>
  videoToSrt(
    manifest.scenes.map((s) => ({
      durationInFrames: s.durationInFrames,
      chunks: chunksFromManifestCaptions(s.captions),
    })),
    manifest.fps,
  );

/**
 * Frame for the thumbnail: inside the title scene (the first scene if there
 * is none), late enough that the heading and subheading have animated in and
 * before the scene's closing fade.
 */
export const thumbnailFrame = (manifest: Manifest): number => {
  const index = Math.max(0, manifest.scenes.findIndex((s) => s.scene.type === "title"));
  const start = manifest.scenes
    .slice(0, index)
    .reduce((sum, s) => sum + s.durationInFrames, 0);
  const duration = manifest.scenes[index]!.durationInFrames;
  const settled = framesAt(manifest.fps, 1.5);
  const beforeFade = duration - framesAt(manifest.fps, beats.fadeOut) - 1;
  return start + Math.max(0, Math.min(settled, beforeFade));
};

export const writeJson = async (path: string, data: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
};
