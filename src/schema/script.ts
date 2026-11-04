import { z } from "zod";
import { cueProblems } from "../align/cues";

/**
 * Script format: what an author writes in scripts/<slug>.yaml.
 * Durations are never written here. They come from the generated audio.
 */

const EM_DASH = "—";

/** User-facing copy: non-empty, trimmed, and no em dashes. */
const copy = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "must not be empty")
    .max(max, `must be at most ${max} characters`)
    .refine((s) => !s.includes(EM_DASH), {
      message: "must not contain em dashes (use a comma, colon, or period)",
    });

/** Languages the code scene accepts. Names are Shiki language ids. */
export const codeLanguages = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "css",
  "html",
  "bash",
  "python",
  "go",
  "rust",
  "sql",
  "yaml",
] as const;
export type CodeLanguage = (typeof codeLanguages)[number];

/** Inclusive, 1-based line range. */
export const lineRangeSchema = z
  .object({
    from: z.number().int().min(1),
    to: z.number().int().min(1),
  })
  .strict()
  .refine((r) => r.to >= r.from, {
    message: "`to` must be greater than or equal to `from`",
  });
export type LineRange = z.infer<typeof lineRangeSchema>;

/**
 * One highlight step: a line range, plus an optional `cue`, a word (or short
 * phrase) from the scene's narration. With a cue the step starts the moment
 * that word is spoken; steps without one are spaced evenly between their
 * neighbours.
 */
export const highlightStepSchema = z
  .object({
    from: z.number().int().min(1),
    to: z.number().int().min(1),
    cue: z.string().trim().min(1, "must not be empty").optional(),
  })
  .strict()
  .refine((r) => r.to >= r.from, {
    message: "`to` must be greater than or equal to `from`",
  });
export type HighlightStep = z.infer<typeof highlightStepSchema>;

const narration = copy(600);

export const titleSceneSchema = z
  .object({
    type: z.literal("title"),
    narration,
    heading: copy(80),
    subheading: copy(120).optional(),
  })
  .strict();

export const codeSceneSchema = z
  .object({
    type: z.literal("code"),
    narration,
    language: z.enum(codeLanguages),
    code: z.string().min(1, "must not be empty"),
    /** Highlight steps, shown in order. Each step is one line range, optionally cued to a word. */
    highlight: z.array(highlightStepSchema).min(1).optional(),
    typing: z.boolean().optional(),
  })
  .strict()
  .superRefine((scene, ctx) => {
    const lineCount = scene.code.replace(/\n+$/, "").split("\n").length;
    scene.highlight?.forEach((range, i) => {
      if (range.to > lineCount) {
        ctx.addIssue({
          code: "custom",
          path: ["highlight", i],
          message: `lines ${range.from}-${range.to} are outside the code (${lineCount} lines)`,
        });
      }
    });
    if (scene.highlight) {
      for (const { step, message } of cueProblems(scene.narration, scene.highlight)) {
        ctx.addIssue({ code: "custom", path: ["highlight", step, "cue"], message });
      }
    }
  });

/**
 * Use rarely: only for a short on-screen phrase that differs from the
 * narration. Captions already show what the voice says, so a `text` scene
 * that repeats the narration puts the same words on screen twice. Prefer
 * `keyword`, `compare`, `output`, `flow` or `stat`, which add something the
 * captions do not.
 */
export const textSceneSchema = z
  .object({
    type: z.literal("text"),
    narration,
    /** One or two short sentences. */
    text: copy(160),
  })
  .strict();

export const listSceneSchema = z
  .object({
    type: z.literal("list"),
    narration,
    /** Revealed one at a time. */
    items: z.array(copy(60)).min(1).max(4, "a list has at most 4 items"),
  })
  .strict();

export const outroSceneSchema = z
  .object({
    type: z.literal("outro"),
    narration,
    /** Call to action shown on screen. */
    cta: copy(80),
  })
  .strict();

/** Lines in each side of a `compare` scene with code. Two short blocks must fit side by side. */
export const COMPARE_MAX_CODE_LINES = 6;
/** Characters per line in a `compare` code block. */
export const COMPARE_MAX_CODE_COLUMNS = 48;

/** One side of a `compare` scene: a short code block or a short label, never both. */
export const compareSideSchema = z
  .object({
    code: z.string().min(1, "must not be empty").optional(),
    label: copy(40).optional(),
  })
  .strict()
  .superRefine((side, ctx) => {
    if ((side.code === undefined) === (side.label === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "set exactly one of `code` or `label`",
      });
      return;
    }
    if (side.code === undefined) return;
    const lines = side.code.replace(/\n+$/, "").split("\n");
    if (lines.length > COMPARE_MAX_CODE_LINES) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: `must be at most ${COMPARE_MAX_CODE_LINES} lines (has ${lines.length}); use a \`code\` scene for longer code`,
      });
    }
    lines.forEach((line, i) => {
      if (line.length > COMPARE_MAX_CODE_COLUMNS) {
        ctx.addIssue({
          code: "custom",
          path: ["code"],
          message: `line ${i + 1} is ${line.length} characters, at most ${COMPARE_MAX_CODE_COLUMNS} fit side by side`,
        });
      }
    });
  });
export type CompareSide = z.infer<typeof compareSideSchema>;

/**
 * Wrong vs right. The wrong side (red cross) shows first, then the right side
 * (green check) reveals. Both sides are code, or both are labels.
 */
export const compareSceneSchema = z
  .object({
    type: z.literal("compare"),
    narration,
    /** Required when the sides are code. */
    language: z.enum(codeLanguages).optional(),
    wrong: compareSideSchema,
    right: compareSideSchema,
  })
  .strict()
  .superRefine((scene, ctx) => {
    // A side with both or neither is already reported on that side.
    const kind = (side: CompareSide) =>
      (side.code === undefined) === (side.label === undefined)
        ? undefined
        : side.code !== undefined
          ? "code"
          : "label";
    const wrong = kind(scene.wrong);
    const right = kind(scene.right);
    if (!wrong || !right) return;
    if (wrong !== right) {
      ctx.addIssue({
        code: "custom",
        path: ["right"],
        message: "both sides must be `code` or both must be `label`",
      });
      return;
    }
    if (wrong === "code" && scene.language === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["language"],
        message: "is required when the sides are code",
      });
    }
    if (wrong === "label" && scene.language !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["language"],
        message: "only applies when the sides are code; remove it or use `code` on both sides",
      });
    }
  });

/** Most words a `keyword` scene may show. */
export const KEYWORD_MAX_WORDS = 3;

/**
 * 1 to 3 words of big kinetic text: the one idea to remember, like
 * "SNAPSHOT" or "STABLE ID". Not a sentence, and not a repeat of the narration.
 */
export const keywordSceneSchema = z
  .object({
    type: z.literal("keyword"),
    narration,
    keyword: copy(24)
      .refine((k) => k.split(/\s+/).length <= KEYWORD_MAX_WORDS, {
        message: `must be 1 to ${KEYWORD_MAX_WORDS} words; use \`text\` for a phrase`,
      })
      .refine((k) => !/[.!?]$/.test(k), {
        message: "is a keyword, not a sentence: drop the final punctuation",
      }),
  })
  .strict()
  .superRefine((scene, ctx) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (norm(scene.keyword) === norm(scene.narration)) {
      ctx.addIssue({
        code: "custom",
        path: ["keyword"],
        message: "must not repeat the narration; captions already show it",
      });
    }
  });

/** Most output lines an `output` scene reveals. */
export const OUTPUT_MAX_LINES = 6;

/** A terminal line: keeps leading spaces so indentation survives. */
const outputLine = z
  .string()
  .max(60, "must be at most 60 characters")
  .refine((s) => s.trim().length > 0, { message: "must not be empty" })
  .refine((s) => !s.includes(EM_DASH), {
    message: "must not contain em dashes (use a comma, colon, or period)",
  });

/** A terminal or console panel that reveals output lines one by one. */
export const outputSceneSchema = z
  .object({
    type: z.literal("output"),
    narration,
    /** Optional command shown after a prompt before the output, e.g. "node index.js". */
    command: outputLine.optional(),
    /** Panel title. Defaults to "Terminal". */
    title: copy(24).optional(),
    lines: z
      .array(outputLine)
      .min(1, "needs at least one output line")
      .max(OUTPUT_MAX_LINES, `has at most ${OUTPUT_MAX_LINES} output lines`),
  })
  .strict();

/** 2 to 4 boxes joined by arrows, revealed in order. */
export const flowSceneSchema = z
  .object({
    type: z.literal("flow"),
    narration,
    steps: z
      .array(copy(24))
      .min(2, "a flow needs at least 2 steps")
      .max(4, "a flow has at most 4 steps"),
  })
  .strict();

/** One big value with a small label, like "+3" over "renders per click". */
export const statSceneSchema = z
  .object({
    type: z.literal("stat"),
    narration,
    /** The big value, e.g. "+3", "40ms", "2x". */
    value: copy(12),
    label: copy(48),
    /** Optional earlier value shown first and struck through, e.g. "+1". */
    from: copy(12).optional(),
  })
  .strict();

export const sceneSchema = z.discriminatedUnion("type", [
  titleSceneSchema,
  codeSceneSchema,
  textSceneSchema,
  listSceneSchema,
  outroSceneSchema,
  compareSceneSchema,
  keywordSceneSchema,
  outputSceneSchema,
  flowSceneSchema,
  statSceneSchema,
]);

/** Audio formats Remotion can play for background music. */
export const musicExtensions = ["mp3", "wav", "m4a", "aac", "ogg"] as const;

const volume = z.number().min(0, "must be between 0 and 1").max(1, "must be between 0 and 1");

/**
 * Optional background music. It loops for the whole video and is ducked
 * (turned down) while narration plays.
 */
export const musicSchema = z
  .object({
    /** Path relative to public/, e.g. "music/lofi.mp3". */
    file: z
      .string()
      .trim()
      .min(1, "must not be empty")
      .refine((f) => !f.startsWith("/") && !f.split(/[\\/]/).includes(".."), {
        message: "must be a path inside public/, e.g. music/lofi.mp3",
      })
      .refine((f) => musicExtensions.some((ext) => f.toLowerCase().endsWith(`.${ext}`)), {
        message: `must be one of: ${musicExtensions.map((e) => `.${e}`).join(", ")}`,
      }),
    /** Level when nobody is talking. Default 0.3. */
    volume: volume.optional(),
    /** Level under narration. Default 0.08. */
    duckedVolume: volume.optional(),
  })
  .strict()
  .refine(
    (m) => m.volume === undefined || m.duckedVolume === undefined || m.duckedVolume <= m.volume,
    { path: ["duckedVolume"], message: "must not be louder than `volume`" },
  );
export type Music = z.infer<typeof musicSchema>;

const voiceName = z.string().trim().min(1, "must not be empty");

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;
export const speedSchema = z
  .number()
  .min(MIN_SPEED, `must be between ${MIN_SPEED} and ${MAX_SPEED}`)
  .max(MAX_SPEED, `must be between ${MIN_SPEED} and ${MAX_SPEED}`);

/**
 * Optional narration voice per TTS provider, since each names voices its own
 * way: Kokoro uses names like "am_michael", Gemini prebuilt names like
 * "Puck", ElevenLabs voice IDs.
 * A provider without an entry uses its default voice.
 */
export const voiceSchema = z
  .object({
    kokoro: voiceName.optional(),
    gemini: voiceName.optional(),
    elevenlabs: voiceName.optional(),
    /** Speaking speed for every provider. 1 is normal, 1.15 is brisk. */
    speed: speedSchema.optional(),
  })
  .strict();
export type Voice = z.infer<typeof voiceSchema>;

/** Animated backgrounds, drawn once behind the whole video. */
export const lookNames = ["grid", "aurora", "classic"] as const;
export type LookName = (typeof lookNames)[number];

/**
 * Caption styles. "pop": big outlined words, 2 to 4 at a time, the spoken
 * word pops in color (the usual Shorts and Reels style). "box": a subtitle
 * box with up to 6 words.
 */
export const captionStyleNames = ["pop", "box"] as const;
export type CaptionStyleName = (typeof captionStyleNames)[number];

/** How the video looks. Every field is optional; defaults live in src/theme. */
export const styleSchema = z
  .object({
    look: z.enum(lookNames).optional(),
    captions: z.enum(captionStyleNames).optional(),
  })
  .strict();
export type Style = z.infer<typeof styleSchema>;

/** Optional channel branding: a handle shown in a corner and on the outro. */
export const brandSchema = z
  .object({
    /** e.g. "@yourchannel". */
    handle: copy(32),
  })
  .strict();
export type Brand = z.infer<typeof brandSchema>;

export const scriptSchema = z
  .object({
    title: copy(100),
    style: styleSchema.optional(),
    brand: brandSchema.optional(),
    voice: voiceSchema.optional(),
    music: musicSchema.optional(),
    scenes: z.array(sceneSchema).min(1, "a script needs at least one scene"),
  })
  .strict();

export type TitleScene = z.infer<typeof titleSceneSchema>;
export type CodeScene = z.infer<typeof codeSceneSchema>;
export type TextScene = z.infer<typeof textSceneSchema>;
export type ListScene = z.infer<typeof listSceneSchema>;
export type OutroScene = z.infer<typeof outroSceneSchema>;
export type CompareScene = z.infer<typeof compareSceneSchema>;
export type KeywordScene = z.infer<typeof keywordSceneSchema>;
export type OutputScene = z.infer<typeof outputSceneSchema>;
export type FlowScene = z.infer<typeof flowSceneSchema>;
export type StatScene = z.infer<typeof statSceneSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneType = Scene["type"];
export type Script = z.infer<typeof scriptSchema>;

export const sceneTypes = [
  "title",
  "code",
  "text",
  "list",
  "outro",
  "compare",
  "keyword",
  "output",
  "flow",
  "stat",
] as const satisfies readonly SceneType[];

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

/** Turns zod issues into lines like `scenes[2].highlight[0]: lines 3-9 are outside the code (7 lines)`. */
export const formatIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path
      .map((p, i) =>
        typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`,
      )
      .join("");
    return `${path || "(root)"}: ${issue.message}`;
  });

/** Validates already-parsed data (e.g. from YAML) against the script schema. */
export const parseScript = (input: unknown): ParseResult<Script> => {
  const result = scriptSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: formatIssues(result.error) };
};
