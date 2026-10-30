import { z } from "zod";

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
    /** Highlight steps, shown in order. Each step is one line range. */
    highlight: z.array(lineRangeSchema).min(1).optional(),
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
  });

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

export const sceneSchema = z.discriminatedUnion("type", [
  titleSceneSchema,
  codeSceneSchema,
  textSceneSchema,
  listSceneSchema,
  outroSceneSchema,
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

export const scriptSchema = z
  .object({
    title: copy(100),
    music: musicSchema.optional(),
    scenes: z.array(sceneSchema).min(1, "a script needs at least one scene"),
  })
  .strict();

export type TitleScene = z.infer<typeof titleSceneSchema>;
export type CodeScene = z.infer<typeof codeSceneSchema>;
export type TextScene = z.infer<typeof textSceneSchema>;
export type ListScene = z.infer<typeof listSceneSchema>;
export type OutroScene = z.infer<typeof outroSceneSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneType = Scene["type"];
export type Script = z.infer<typeof scriptSchema>;

export const sceneTypes = [
  "title",
  "code",
  "text",
  "list",
  "outro",
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
