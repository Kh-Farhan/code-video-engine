import {
  sentenceCount,
  YOUTUBE_TITLE_HARD_LIMIT,
  YOUTUBE_TITLE_TARGET,
  type CodeScene,
  type CompareScene,
  type Meta,
  type Script,
} from "../schema/script";
import { stripPauseMarkers } from "../schema/pauses";
import { isPlaceholderHandle, type MetadataConfig, type PlatformName } from "./config";
import { buildTitles, buildTranscript, clean, detectTopicTags, firstScene, length, truncateWords } from "./generate";
import { fallbackCode, hasAngleBrackets, sanitizePlatformText, stripEmDashes } from "./sanitize";

/**
 * One upload package per video: a section per platform with every field ready
 * to paste. Platform rules (limits) live here; handles, hashtags, links and
 * the call to action come from metadata.config.json.
 */

export const LIMITS = {
  youtube: {
    /** Aim under this many characters so the title is not cut off. */
    titleTarget: YOUTUBE_TITLE_TARGET,
    titleHard: YOUTUBE_TITLE_HARD_LIMIT,
    description: 5000,
    /** The tags field, counted the way YouTube counts it (commas, quotes around multi-word tags). */
    tags: 500,
    maxHashtags: 8,
  },
  tiktok: {
    /** TikTok allows far more, but a caption this short reads in one glance. */
    caption: 300,
    minHashtags: 4,
    maxHashtags: 6,
  },
  instagram: {
    caption: 2200,
    /** Instagram rejects captions with more hashtags than this. */
    maxHashtags: 5,
  },
} as const;

/** Used only when the topic tags and config defaults together are too few for TikTok's minimum. */
const PAD_HASHTAGS = ["programming", "coding", "webdev", "developer", "javascript"];

export type MetaField = keyof Required<Meta>;

/** `meta` with every field filled in, and where each value came from. */
export type ResolvedMeta = {
  youtubeTitle: string;
  hook: string;
  summary: string;
  /** Undefined when the script has no meta.fixCode and no code to take it from. */
  fixCode?: string;
  topicTags: string[];
  generated: MetaField[];
};

const sentences = (text: string): string[] =>
  clean(text)
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

const asSentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/** First 1 or 2 sentences, at most `max` characters. */
const firstSentences = (text: string, count: number, max: number): string => {
  const picked = sentences(text).slice(0, count).join(" ");
  return length(picked) <= max ? picked : asSentence(truncateWords(picked, max - 1));
};

/** Where a generated summary comes from: the first scene that explains, not the title or the outro. */
const explainingNarration = (script: Script): string => {
  const scene =
    script.scenes.find((s) => s.type !== "title" && s.type !== "outro") ?? script.scenes[0];
  return scene ? stripPauseMarkers(scene.narration) : script.title;
};

/** The fix: the right side of the last code compare, else the last code scene, else a compare label. */
export const generateFixCode = (script: Script): string | undefined => {
  const last = <T>(items: T[]): T | undefined => items[items.length - 1];
  const compares = script.scenes.filter((s): s is CompareScene => s.type === "compare");
  const rightCode = last(compares.flatMap((s) => (s.right.code ? [s.right.code] : [])));
  if (rightCode) return rightCode.replace(/\n+$/, "");
  const code = last(script.scenes.filter((s): s is CodeScene => s.type === "code"));
  if (code) return code.code.replace(/\n+$/, "");
  return last(compares.flatMap((s) => (s.right.label ? [s.right.label] : [])));
};

export const normalizeTag = (tag: string): string => tag.trim().replace(/^#+/, "").toLowerCase();

/** Fills every meta field: the script's own value, or one generated from the scenes. */
export const resolveMeta = (script: Script): ResolvedMeta => {
  const meta = script.meta ?? {};
  const generated: MetaField[] = [];
  const pick = <T>(field: MetaField, own: T | undefined, make: () => T): T => {
    if (own !== undefined) return own;
    generated.push(field);
    return make();
  };
  const titleScene = firstScene(script, "title");
  const youtubeTitle = pick("youtubeTitle", meta.youtubeTitle, () =>
    buildTitles(script)[0] ?? truncateWords(clean(script.title), YOUTUBE_TITLE_TARGET - 1),
  );
  const hook = pick("hook", meta.hook, () => asSentence(clean(titleScene?.heading ?? script.title)));
  const summary = pick("summary", meta.summary, () => firstSentences(explainingNarration(script), 2, 400));
  const fixCode = pick("fixCode", meta.fixCode, () => generateFixCode(script));
  const topicTags = pick("topicTags", meta.topicTags, () => detectTopicTags(script).slice(0, 5));
  return {
    youtubeTitle: clean(youtubeTitle),
    hook: clean(hook),
    summary: clean(summary),
    ...(fixCode ? { fixCode: fixCode.replace(/\n+$/, "") } : {}),
    topicTags: unique(topicTags.map(normalizeTag)),
    generated,
  };
};

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/**
 * Hashtags for one platform, without "#": the script's topic tags first, then
 * the config defaults, deduplicated and capped to the platform's limit.
 * YouTube always starts with #shorts; TikTok is padded up to its minimum.
 */
export const platformHashtags = (
  platform: PlatformName,
  topicTags: string[],
  config: MetadataConfig,
): string[] => {
  const defaults = config.platforms[platform].hashtags.map(normalizeTag);
  const topics = topicTags.map(normalizeTag);
  switch (platform) {
    case "youtube":
      return unique(["shorts", ...topics, ...defaults]).slice(0, LIMITS.youtube.maxHashtags);
    case "tiktok": {
      const tags = unique([...topics, ...defaults]).slice(0, LIMITS.tiktok.maxHashtags);
      for (const pad of PAD_HASHTAGS) {
        if (tags.length >= LIMITS.tiktok.minHashtags) break;
        if (!tags.includes(pad)) tags.push(pad);
      }
      return tags;
    }
    case "instagram":
      return unique([...topics, ...defaults]).slice(0, LIMITS.instagram.maxHashtags);
  }
};

const hashtagLine = (tags: string[]): string => tags.map((t) => `#${t}`).join(" ");

/** Length of the YouTube tags field as YouTube counts it: commas between tags, quotes around tags with spaces. */
export const youtubeTagsLength = (tags: string[]): number =>
  tags.reduce((sum, t, i) => sum + length(t) + (t.includes(" ") ? 2 : 0) + (i > 0 ? 1 : 0), 0);

/**
 * YouTube tags: topic tags, the title as a search phrase, the channel name,
 * then the config defaults, added in order while the field stays under 500
 * characters. Tags cannot hold < or >, so those characters are dropped.
 */
export const buildYoutubeTags = (meta: ResolvedMeta, config: MetadataConfig): string[] => {
  const titlePhrase = meta.youtubeTitle
    .toLowerCase()
    .replace(/[^a-z0-9.+# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = [
    ...meta.topicTags,
    titlePhrase,
    config.channelName.toLowerCase(),
    ...config.platforms.youtube.tags,
  ]
    .map((t) => stripEmDashes(t).replace(/[<>,]/g, "").trim())
    .filter((t) => t.length > 0 && length(t) <= 100);
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const tag of candidates) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    if (youtubeTagsLength([...tags, tag]) >= LIMITS.youtube.tags) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
};

/** "{handle}" in a call to action becomes the platform's handle. */
const ctaFor = (platform: PlatformName, config: MetadataConfig): string => {
  const { cta, handle } = config.platforms[platform];
  return (cta ?? config.cta).replaceAll("{handle}", handle);
};

/** The YouTube title: sanitized, cut at a word boundary only if it breaks the hard limit. */
export const youtubeTitle = (meta: ResolvedMeta): string => {
  const title = sanitizePlatformText(meta.youtubeTitle);
  return length(title) <= LIMITS.youtube.titleHard ? title : truncateWords(title, LIMITS.youtube.titleHard);
};

const fixBlock = (meta: ResolvedMeta): string | undefined =>
  meta.fixCode ? `The fix:\n${sanitizePlatformText(meta.fixCode)}` : undefined;

const paragraphs = (parts: (string | undefined | false)[]): string =>
  parts.filter((p): p is string => typeof p === "string" && p.length > 0).join("\n\n");

export const youtubeDescription = (meta: ResolvedMeta, config: MetadataConfig): string => {
  const text = paragraphs([
    sanitizePlatformText(meta.hook),
    sanitizePlatformText(meta.summary),
    fixBlock(meta),
    sanitizePlatformText(ctaFor("youtube", config)),
    `Code: ${config.githubRepo}`,
    hashtagLine(platformHashtags("youtube", meta.topicTags, config)),
  ]);
  return [...text].slice(0, LIMITS.youtube.description).join("");
};

/**
 * TikTok caption under 300 characters: hook, short summary, fix, 4 to 6
 * hashtags. Tries the fullest version first and drops detail until it fits.
 */
export const tiktokCaption = (meta: ResolvedMeta, config: MetadataConfig): string => {
  const tags = platformHashtags("tiktok", meta.topicTags, config);
  const hook = sanitizePlatformText(meta.hook);
  const summary = sanitizePlatformText(meta.summary);
  const oneSentence = sentences(summary)[0] ?? summary;
  const fix = meta.fixCode ? sanitizePlatformText(meta.fixCode) : undefined;
  // A one-line fix reads inline; a longer one points at the pinned comment.
  const fixInline = fix && !fix.includes("\n") ? `Fix: ${fix}` : undefined;
  const fixPointer = fix ? "Fix in the first comment." : undefined;
  const build = (body: (string | undefined)[], n = tags.length) =>
    paragraphs([[hook, ...body].filter(Boolean).join("\n"), hashtagLine(tags.slice(0, n))]);
  const variants = [
    build([summary, fixInline ?? (fix ? `The fix:\n${fix}` : undefined)]),
    build([oneSentence, fixInline ?? fixPointer]),
    build([oneSentence, fixPointer]),
    build([fixPointer]),
    build([fixPointer], LIMITS.tiktok.minHashtags),
  ];
  const fits = variants.find((v) => length(v) < LIMITS.tiktok.caption);
  if (fits) return fits;
  // Only a very long hook gets here: cut it to make room for the hashtags.
  const tagLine = hashtagLine(tags.slice(0, LIMITS.tiktok.minHashtags));
  return paragraphs([truncateWords(hook, LIMITS.tiktok.caption - length(tagLine) - 3), tagLine]);
};

/**
 * Instagram caption: the hook alone on line 1 (only two lines show before
 * "more"), then summary, fix, call to action with the handle, and at most 5
 * hashtags.
 */
export const instagramCaption = (meta: ResolvedMeta, config: MetadataConfig): string => {
  const text = paragraphs([
    sanitizePlatformText(meta.hook),
    sanitizePlatformText(meta.summary),
    fixBlock(meta),
    sanitizePlatformText(ctaFor("instagram", config)),
    hashtagLine(platformHashtags("instagram", meta.topicTags, config)),
  ]);
  return [...text].slice(0, LIMITS.instagram.caption).join("");
};

export type UploadField = {
  label: string;
  value: string;
  /** Shown next to the label, e.g. "47/100 characters". */
  count?: string;
  note?: string;
};

export type UploadSection = {
  id: PlatformName | "comment";
  heading: string;
  intro?: string;
  fields: UploadField[];
  checklist: string[];
};

export type UploadPackage = {
  title: string;
  slug: string;
  meta: ResolvedMeta;
  sections: UploadSection[];
  transcript: string[];
  /** Things to fix before uploading: placeholder handles, long titles, generated fields. */
  warnings: string[];
};

export type UploadPaths = { video: string; cover: string };

const count = (text: string, limit: number, unit = "characters") => `${length(text)}/${limit} ${unit}`;

export const buildUploadPackage = (
  script: Script,
  slug: string,
  config: MetadataConfig,
  paths: UploadPaths = { video: `out/${slug}/${slug}-short.mp4`, cover: `out/${slug}/cover.png` },
): UploadPackage => {
  const meta = resolveMeta(script);
  const title = youtubeTitle(meta);
  const description = youtubeDescription(meta, config);
  const tags = buildYoutubeTags(meta, config);
  const tiktok = tiktokCaption(meta, config);
  const instagram = instagramCaption(meta, config);

  const warnings: string[] = [];
  if (length(title) >= LIMITS.youtube.titleTarget) {
    warnings.push(
      `YouTube title is ${length(title)} characters; keep it under ${LIMITS.youtube.titleTarget} so it is not cut off.`,
    );
  }
  for (const platform of ["youtube", "tiktok", "instagram"] as const) {
    const { handle } = config.platforms[platform];
    if (isPlaceholderHandle(handle)) {
      warnings.push(`${platform} handle is still the placeholder ${handle}: set it in metadata.config.json.`);
    }
  }
  if (meta.generated.length > 0) {
    warnings.push(`Generated from the scenes (add them to meta to control them): ${meta.generated.join(", ")}.`);
  }
  if (!meta.fixCode) warnings.push("No fix code: add meta.fixCode for the pinned comment.");
  if (sentenceCount(meta.summary) > 2) warnings.push("Summary is longer than 2 sentences.");

  const comment: UploadField[] = meta.fixCode
    ? [
        { label: "Comment", value: stripEmDashes(meta.fixCode), note: "The exact fix code. Post it as the first comment and pin it." },
        {
          label: "Fallback comment",
          value: fallbackCode(meta.fixCode),
          note: hasAngleBrackets(meta.fixCode)
            ? "Use this if a platform rejects the original: => is ⇒, < and > are ‹ ›."
            : "Same as the original: this code has no < or >.",
        },
      ]
    : [];

  const sections: UploadSection[] = [
    {
      id: "youtube",
      heading: "YouTube Shorts",
      intro: `Upload ${paths.video}.`,
      fields: [
        { label: "Title", value: title, count: count(title, LIMITS.youtube.titleHard) },
        { label: "Description", value: description, count: count(description, LIMITS.youtube.description) },
        {
          label: "Tags",
          value: tags.join(", "),
          count: `${youtubeTagsLength(tags)}/${LIMITS.youtube.tags} characters`,
        },
        ...comment.slice(0, 1).map((f) => ({ ...f, label: "Pinned comment" })),
      ],
      checklist: [
        "Audience: No, it's not made for kids",
        "Category: Science & Technology",
        "Pin the comment after publishing",
        "After publishing, check it shows under the channel's Shorts tab",
      ],
    },
    {
      id: "tiktok",
      heading: "TikTok",
      intro: `Upload ${paths.video}.`,
      fields: [{ label: "Caption", value: tiktok, count: count(tiktok, LIMITS.tiktok.caption) }],
      checklist: [
        "AI-generated content label: on",
        "Cover: pick the title frame (the first second)",
        "Post the fix as the first comment and pin it",
      ],
    },
    {
      id: "instagram",
      heading: "Instagram Reels (and Facebook)",
      intro: `Upload ${paths.video} as a Reel.`,
      fields: [{ label: "Caption", value: instagram, count: count(instagram, LIMITS.instagram.caption) }],
      checklist: [
        "Share to Facebook: on",
        "AI label: on",
        `Cover: upload ${paths.cover}`,
        "Key text centered on the cover so the profile grid crop keeps it",
        "Post the fix as the first comment and pin it",
      ],
    },
    {
      id: "comment",
      heading: "Pinned or first comment (every platform)",
      fields: comment,
      checklist: [],
    },
  ];

  return { title: clean(script.title), slug, meta, sections, transcript: buildTranscript(script), warnings };
};
