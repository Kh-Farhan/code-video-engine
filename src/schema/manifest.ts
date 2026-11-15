import { z } from "zod";
import {
  captionStyleNames,
  formatIssues,
  lookNames,
  sceneSchema,
  type ParseResult,
} from "./script";

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

/**
 * One spoken word, in the shape of Remotion's `Caption` from
 * @remotion/captions. Milliseconds from the start of its scene. `text` is the
 * script's own word (with a leading space for every word but the first).
 */
export const wordCaptionSchema = z
  .object({
    text: z.string().min(1),
    startMs: z.number().min(0),
    endMs: z.number().min(0),
    timestampMs: z.number().nullable(),
    confidence: z.number().nullable(),
    pageBreakAfter: z.boolean().optional(),
  })
  .strict()
  .refine((c) => c.endMs >= c.startMs, { message: "`endMs` must not be before `startMs`" });
export type WordCaption = z.infer<typeof wordCaptionSchema>;

/** Where a scene's word timings came from. */
export const wordTimingSources = ["aligned", "estimated"] as const;
export type WordTimingSource = (typeof wordTimingSources)[number];

export const manifestSceneSchema = z
  .object({
    /** The scene exactly as written in the script. */
    scene: sceneSchema,
    /**
     * This scene's own audio, relative to public/, e.g. "audio/<slug>/0.mp3".
     * Only with per-scene audio; continuous narration uses the top-level
     * `narration` track instead.
     */
    audio: z.string().min(1).optional(),
    /**
     * Continuous narration: from the scene's first spoken word to the next
     * scene's first word (the last scene runs a short tail past its last
     * word). Per-scene audio: the audio length plus padding.
     */
    durationInFrames: z.number().int().positive(),
    captions: z
      .object({
        granularity: z.enum(["word", "sentence"]),
        cues: z.array(captionCueSchema),
      })
      .strict(),
    /**
     * Per-word timings as Remotion Caption objects: "aligned" from the audio
     * (whisper.cpp), or "estimated" from word length. Missing in older manifests.
     */
    words: z
      .object({
        source: z.enum(wordTimingSources),
        captions: z.array(wordCaptionSchema),
      })
      .strict()
      .optional(),
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

/** Background music with its levels resolved (no defaults left to apply). */
export const manifestMusicSchema = z
  .object({
    /** Path relative to public/, as staticFile() expects. */
    src: z.string().min(1),
    /** Level when nobody is talking, 0 to 1. */
    volume: z.number().min(0).max(1),
    /** Level under narration, 0 to 1. */
    duckedVolume: z.number().min(0).max(1),
  })
  .strict();
export type ManifestMusic = z.infer<typeof manifestMusicSchema>;

/** One narration track for the whole video, starting at frame 0. */
export const manifestNarrationSchema = z
  .object({
    /** Path relative to public/, as staticFile() expects. */
    src: z.string().min(1),
    durationInFrames: z.number().int().positive(),
  })
  .strict();
export type ManifestNarration = z.infer<typeof manifestNarrationSchema>;

export const manifestSchema = z
  .object({
    version: z.literal(1),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be kebab-case"),
    title: z.string().min(1),
    fps: z.number().int().positive(),
    /**
     * Continuous narration track. Scene captions and words stay relative to
     * their scene; scenes are cut so the track lines up with them.
     */
    narration: manifestNarrationSchema.optional(),
    /** Optional background music, ducked under narration. */
    music: manifestMusicSchema.optional(),
    /** Resolved look and caption style. Missing in older manifests, which use the defaults. */
    style: z
      .object({ look: z.enum(lookNames), captions: z.enum(captionStyleNames) })
      .strict()
      .optional(),
    /** Optional channel branding. */
    brand: z.object({ handle: z.string().min(1) }).strict().optional(),
    scenes: z.array(manifestSceneSchema).min(1),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.narration) return;
    m.scenes.forEach((s, i) => {
      if (!s.audio) {
        ctx.addIssue({
          code: "custom",
          path: ["scenes", i, "audio"],
          message: "needs its own audio when the manifest has no `narration` track",
        });
      }
    });
  });
export type Manifest = z.infer<typeof manifestSchema>;

export const totalDurationInFrames = (manifest: Manifest): number =>
  manifest.scenes.reduce((sum, s) => sum + s.durationInFrames, 0);

export const parseManifest = (input: unknown): ParseResult<Manifest> => {
  const result = manifestSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: formatIssues(result.error) };
};
