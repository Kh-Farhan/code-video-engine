import { z } from "zod";
import { formatIssues, sceneSchema, type ParseResult } from "./script";

/**
 * Render manifest: written by the CLI after TTS, read by the Remotion composition.
 * All timings are in frames at `fps`.
 */

/** One caption cue. Frames are relative to the start of its scene. */
export const captionCueSchema = z
  .object({
    text: z.string().min(1),
    startFrame: z.number().int().min(0),
    endFrame: z.number().int().min(0),
  })
  .strict()
  .refine((c) => c.endFrame > c.startFrame, {
    message: "`endFrame` must be greater than `startFrame`",
  });
export type CaptionCue = z.infer<typeof captionCueSchema>;

export const manifestSceneSchema = z
  .object({
    /** The scene exactly as written in the script. */
    scene: sceneSchema,
    /** Audio path relative to public/, e.g. "audio/<slug>/0.mp3". */
    audio: z.string().min(1),
    /** Audio length plus padding. */
    durationInFrames: z.number().int().positive(),
    captions: z
      .object({
        granularity: z.enum(["word", "sentence"]),
        cues: z.array(captionCueSchema),
      })
      .strict(),
  })
  .strict()
  .superRefine((s, ctx) => {
    s.captions.cues.forEach((cue, i) => {
      if (cue.endFrame > s.durationInFrames) {
        ctx.addIssue({
          code: "custom",
          path: ["captions", "cues", i, "endFrame"],
          message: `ends at frame ${cue.endFrame}, after the scene (${s.durationInFrames} frames)`,
        });
      }
    });
  });
export type ManifestScene = z.infer<typeof manifestSceneSchema>;

export const manifestSchema = z
  .object({
    version: z.literal(1),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be kebab-case"),
    title: z.string().min(1),
    fps: z.number().int().positive(),
    scenes: z.array(manifestSceneSchema).min(1),
  })
  .strict();
export type Manifest = z.infer<typeof manifestSchema>;

export const totalDurationInFrames = (manifest: Manifest): number =>
  manifest.scenes.reduce((sum, s) => sum + s.durationInFrames, 0);

export const parseManifest = (input: unknown): ParseResult<Manifest> => {
  const result = manifestSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: formatIssues(result.error) };
};
