import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { sceneWordTimings, wordsToCues, chunksFromManifestCaptions, videoToSrt } from "../captions";
import { parseManifest, type Manifest } from "../schema/manifest";
import type { Script } from "../schema/script";
import { beats, framesAt } from "../scenes/timing";
import { FPS, SCENE_PADDING_SECONDS } from "../theme";
import { CliError } from "./progress";
import type { SceneAudio } from "./voice";

/**
 * Combines the script, measured audio durations and caption timings into a
 * render manifest. Each scene lasts its audio (rounded up, so speech is never
 * cut off) plus SCENE_PADDING_SECONDS. Captions are word cues spread over the
 * spoken part only, so they never run into the padding.
 */
export const buildManifest = (
  script: Script,
  slug: string,
  audio: readonly Pick<SceneAudio, "audio" | "durationSeconds">[],
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
    scenes: script.scenes.map((scene, i) => {
      const { audio: file, durationSeconds } = audio[i]!;
      const audioDurationInFrames = Math.max(1, Math.ceil(durationSeconds * fps));
      const words = sceneWordTimings({ narration: scene.narration, audioDurationInFrames });
      return {
        scene,
        audio: file,
        durationInFrames: audioDurationInFrames + padding,
        captions: { granularity: "word", cues: wordsToCues(words) },
      };
    }),
  };
  const parsed = parseManifest(manifest);
  if (!parsed.success) {
    throw new CliError(`Built an invalid manifest:\n  ${parsed.errors.join("\n  ")}`);
  }
  return parsed.data;
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
