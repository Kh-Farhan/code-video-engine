import { readFileSync } from "node:fs";
import { z } from "zod";
import { formatIssues, topicTagSchema } from "../schema/script";

/**
 * metadata.config.json at the repo root: channel handles, links, default
 * hashtags and the call to action. Everything platform-specific in the upload
 * files comes from here; platform rules (character and hashtag limits) live in
 * src/metadata/platforms.ts.
 */

export const METADATA_CONFIG_PATH = "metadata.config.json";

const EM_DASH = "—";
const text = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .refine((s) => !s.includes(EM_DASH), { message: "must not contain em dashes" });

const handle = z
  .string()
  .trim()
  .regex(/^@[A-Za-z0-9._]+$/, "must look like @handle");

const platform = z.object({
  handle,
  /** Default hashtags, added after the script's topic tags. With or without "#". */
  hashtags: z.array(topicTagSchema),
  /** Call to action for this platform. "{handle}" is replaced with the handle. Defaults to `cta`. */
  cta: text.optional(),
});

export const metadataConfigSchema = z
  .object({
    channelName: text,
    githubRepo: z.url(),
    /** Default call to action line. */
    cta: text,
    platforms: z
      .object({
        youtube: platform.extend({
          /** Default YouTube tags (the comma-separated field), added after the topic tags. */
          tags: z.array(text).default([]),
        }),
        tiktok: platform,
        instagram: platform,
      })
      .strict(),
  })
  .strict();

export type MetadataConfig = z.infer<typeof metadataConfigSchema>;
export type PlatformName = keyof MetadataConfig["platforms"];

/** A handle still holding the placeholder from the template, e.g. "@TODO_instagram_handle". */
export const isPlaceholderHandle = (h: string): boolean => /todo|your_?handle/i.test(h);

export const parseMetadataConfig = (
  input: unknown,
): { success: true; data: MetadataConfig } | { success: false; errors: string[] } => {
  const result = metadataConfigSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: formatIssues(result.error) };
};

/** Reads and validates the config. Throws with every problem listed. */
export const loadMetadataConfig = (path = METADATA_CONFIG_PATH): MetadataConfig => {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = parseMetadataConfig(raw);
  if (!result.success) {
    throw new Error(`${path} is invalid:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return result.data;
};
