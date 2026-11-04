import { sanitizeCaptionText } from "../captions/text";
import type { CodeLanguage, Script, TextScene, TitleScene } from "../schema/script";

/**
 * Upload metadata (YouTube titles, description, hashtags, transcript) built
 * from a script with plain templates. No network calls, fully deterministic.
 */

/** YouTube cuts titles off around here in search results and on Shorts. */
export const MAX_TITLE_LENGTH = 59;
export const TITLE_OPTION_COUNT = 3;
export const MIN_HASHTAGS = 5;
export const MAX_HASHTAGS = 8;

export type UploadMetadata = {
  titles: string[];
  description: {
    summary: string;
    takeaway?: string;
    follow: string;
  };
  hashtags: string[];
  transcript: string[];
};

const EM_DASH = "—";

/** Removes em dashes and collapses whitespace in any generated copy. */
const clean = (text: string): string => sanitizeCaptionText(text);

const length = (s: string): number => [...s].length;

const stripTrailingPunctuation = (s: string): string => s.replace(/[\s.,;:!?]+$/, "");

/** Ends a sentence with a period unless it already ends in . ! or ?. */
const asSentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/** "Three cases" -> "three cases", "A bug" -> "a bug", but "API keys" and "Next.js" stay as they are. */
const lowerFirst = (s: string): string => {
  const first = s.split(" ")[0] ?? "";
  return first === "A" || /^[A-Z][a-z]+[,:;]?$/.test(first) ? s[0]!.toLowerCase() + s.slice(1) : s;
};

/** True for a phrase like "Server vs Client Components", false for a sentence ending in . ? or !. */
const isPhrase = (s: string): boolean => !/[.?!](\s|$)/.test(s);

/** "Heading: sub" for a phrase, "Question? Sub" for a sentence. */
const joinHeading = (heading: string, sub: string): string =>
  isPhrase(heading) ? `${stripTrailingPunctuation(heading)}: ${sub}` : `${heading} ${sub}`;

/** Cuts at a word boundary so the result fits in `max` characters. */
export const truncateWords = (text: string, max: number): string => {
  if (length(text) <= max) return text;
  const words = text.split(" ");
  let out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (length(next) > max) break;
    out = next;
  }
  return stripTrailingPunctuation(out || [...text].slice(0, max).join(""));
};

const firstScene = <T extends Script["scenes"][number]["type"]>(script: Script, type: T) =>
  script.scenes.find((s) => s.type === type) as Extract<Script["scenes"][number], { type: T }> | undefined;

/**
 * Three distinct titles under 60 characters. Candidates come from the script
 * title and the title scene heading, in order of preference; the first that
 * fit win. If too few fit, the longest sources are cut at a word boundary.
 */
export const buildTitles = (script: Script, max = MAX_TITLE_LENGTH): string[] => {
  const title = clean(script.title);
  const titleScene: TitleScene | undefined = firstScene(script, "title");
  const heading = titleScene ? clean(titleScene.heading) : undefined;
  const sub = titleScene?.subheading ? clean(titleScene.subheading) : undefined;
  const lead = heading ?? title;
  // "Why does this log 3, 3, 3?" or "Your ref changed. The screen did not."
  // are sentences: they keep their punctuation and skip the phrase templates.
  const phrase = isPhrase(lead);
  const base = stripTrailingPunctuation(lead);

  const candidates = [
    title,
    heading,
    heading && sub ? joinHeading(heading, stripTrailingPunctuation(sub)) : undefined,
    phrase ? `${base}, explained` : undefined,
    `${phrase ? base : lead} #shorts`,
    phrase ? `Quick tip: ${base}` : undefined,
    heading && heading !== title ? `${isPhrase(title) ? stripTrailingPunctuation(title) : title} #shorts` : undefined,
  ];

  const picked: string[] = [];
  const seen = new Set<string>();
  const add = (t: string | undefined) => {
    if (!t || picked.length >= TITLE_OPTION_COUNT) return;
    const key = t.toLowerCase();
    if (seen.has(key) || length(t) > max) return;
    seen.add(key);
    picked.push(t);
  };
  candidates.forEach(add);
  // Fallbacks for very long titles and headings: cut them down to fit.
  [title, heading, `${base} #shorts`].forEach((t) => t && add(truncateWords(t, max)));
  // Last resort for a script whose title and heading are the same long sentence.
  if (picked.length < TITLE_OPTION_COUNT) add(truncateWords(`Quick tip: ${base}`, max));
  return picked;
};

/** One sentence: the heading plus the subheading, or the title on its own. */
export const buildSummary = (script: Script): string => {
  const titleScene = firstScene(script, "title");
  const heading = clean(titleScene?.heading ?? script.title);
  const sub = titleScene?.subheading ? clean(titleScene.subheading) : undefined;
  if (!sub) return asSentence(heading);
  return isPhrase(heading)
    ? `${stripTrailingPunctuation(heading)}: ${asSentence(lowerFirst(sub))}`
    : `${asSentence(heading)} ${asSentence(sub)}`;
};

/** The first text scene's on-screen sentence, or undefined without one. */
export const buildTakeaway = (script: Script): string | undefined => {
  const text: TextScene | undefined = firstScene(script, "text");
  return text ? asSentence(clean(text.text)) : undefined;
};

export const buildFollowLine = (script: Script): string =>
  script.brand
    ? `Follow ${clean(script.brand.handle)} for more quick developer tips.`
    : "Follow for more quick developer tips.";

/** Topic keywords found in on-screen text, narration and code, in priority order. */
const topicTags: readonly [RegExp, string][] = [
  [/\bnext\.?js\b|\bapp router\b/i, "#nextjs"],
  [/\breact\b/i, "#react"],
  [/\buse(State|Effect|Memo|Callback|Ref|Context|Reducer)\b/, "#react"],
  [/\bshopify\b/i, "#shopify"],
  [/\bvue\b/i, "#vue"],
  [/\bsvelte\b/i, "#svelte"],
  [/\bangular\b/i, "#angular"],
  [/\bnode\.?js\b/i, "#nodejs"],
  [/\bdeno\b/i, "#deno"],
  [/\bbun\b/i, "#bun"],
  [/\btailwind\b/i, "#tailwindcss"],
  [/\bgraphql\b/i, "#graphql"],
  [/\bdocker\b/i, "#docker"],
  [/\bkubernetes\b/i, "#kubernetes"],
  [/\bgit(hub)?\b/i, "#git"],
  [/\bpostgres(ql)?\b/i, "#postgresql"],
  [/\btypescript\b/i, "#typescript"],
  [/\bjavascript\b/i, "#javascript"],
  [/\bpython\b/i, "#python"],
  [/\brust\b/i, "#rust"],
  [/\bgolang\b/i, "#golang"],
  [/\bcss\b/i, "#css"],
  [/\bapi\b/i, "#api"],
];

const languageTags: Partial<Record<CodeLanguage, string[]>> = {
  typescript: ["#typescript"],
  tsx: ["#typescript", "#react"],
  javascript: ["#javascript"],
  jsx: ["#javascript", "#react"],
  python: ["#python"],
  go: ["#golang"],
  rust: ["#rust"],
  sql: ["#sql"],
  css: ["#css"],
  html: ["#html"],
};

const genericTags = ["#programming", "#webdev", "#coding", "#developer", "#softwareengineering"];

const sceneText = (scene: Script["scenes"][number]): string[] => {
  switch (scene.type) {
    case "title":
      return [scene.narration, scene.heading, scene.subheading ?? ""];
    case "code":
      return [scene.narration, scene.code];
    case "text":
      return [scene.narration, scene.text];
    case "list":
      return [scene.narration, ...scene.items];
    case "outro":
      return [scene.narration, scene.cta];
    case "compare":
      return [
        scene.narration,
        scene.wrong.code ?? scene.wrong.label ?? "",
        scene.right.code ?? scene.right.label ?? "",
      ];
    case "keyword":
      return [scene.narration, scene.keyword];
    case "output":
      return [scene.narration, scene.command ?? "", ...scene.lines];
    case "flow":
      return [scene.narration, ...scene.steps];
    case "stat":
      return [scene.narration, scene.value, scene.label];
  }
};

/**
 * 5 to 8 hashtags: #shorts first, then up to 5 topic and language tags from
 * the script, then two general programming tags (more if needed to reach 5).
 */
export const buildHashtags = (script: Script): string[] => {
  const titleScene = firstScene(script, "title");
  // Topics named in the title or heading rank above ones only mentioned in passing.
  const headline = [script.title, titleScene?.heading ?? "", titleScene?.subheading ?? ""].join("\n");
  const body = [script.title, ...script.scenes.flatMap(sceneText)].join("\n");
  const specific = new Set<string>();
  for (const text of [headline, body]) {
    for (const [pattern, tag] of topicTags) if (pattern.test(text)) specific.add(tag);
  }
  for (const scene of script.scenes) {
    if ((scene.type === "code" || scene.type === "compare") && scene.language) {
      languageTags[scene.language]?.forEach((t) => specific.add(t));
    }
  }
  const tags = ["#shorts", ...[...specific].filter((t) => t !== "#shorts").slice(0, 5)];
  const generics = genericTags.filter((t) => !tags.includes(t));
  const wanted = Math.min(MAX_HASHTAGS, Math.max(MIN_HASHTAGS, tags.length + 2));
  while (tags.length < wanted && generics.length > 0) tags.push(generics.shift()!);
  return tags;
};

/** Every scene's narration, one paragraph per scene. */
export const buildTranscript = (script: Script): string[] =>
  script.scenes.map((s) => clean(s.narration)).filter(Boolean);

export const buildUploadMetadata = (script: Script): UploadMetadata => {
  const takeaway = buildTakeaway(script);
  return {
    titles: buildTitles(script),
    description: {
      summary: buildSummary(script),
      ...(takeaway ? { takeaway } : {}),
      follow: buildFollowLine(script),
    },
    hashtags: buildHashtags(script),
    transcript: buildTranscript(script),
  };
};

/** The description exactly as it should be pasted into YouTube. */
export const descriptionText = (meta: UploadMetadata): string =>
  [
    meta.description.summary,
    meta.description.takeaway ? `Key takeaway: ${meta.description.takeaway}` : undefined,
    meta.description.follow,
    meta.hashtags.join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");

/** out/<slug>/upload.md. */
export const renderUploadMarkdown = (script: Script, meta = buildUploadMetadata(script)): string => {
  const md = [
    `# Upload: ${clean(script.title)}`,
    "",
    "## Title options",
    "",
    ...meta.titles.map((t, i) => `${i + 1}. ${t} (${length(t)} characters)`),
    "",
    "## Description",
    "",
    "```text",
    descriptionText(meta),
    "```",
    "",
    "## Hashtags",
    "",
    meta.hashtags.join(" "),
    "",
    "## Transcript",
    "",
    meta.transcript.join("\n\n"),
    "",
  ].join("\n");
  // Belt and braces: the schema already rejects em dashes in the script.
  return md.split(EM_DASH).join(",");
};
