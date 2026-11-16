import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { loadScriptFile, slugFromPath } from "../src/cli/loadScript";
import { pipelinePaths } from "../src/cli/paths";
import {
  buildHashtags,
  buildTitles,
  buildUploadPackage,
  buildYoutubeTags,
  fallbackCode,
  generateFixCode,
  instagramCaption,
  LIMITS,
  loadMetadataConfig,
  MAX_HASHTAGS,
  MIN_HASHTAGS,
  parseMetadataConfig,
  platformHashtags,
  renderUploadHtml,
  renderUploadMarkdown,
  resolveMeta,
  sanitizePlatformText,
  tiktokCaption,
  truncateWords,
  youtubeDescription,
  youtubeTagsLength,
  youtubeTitle,
  type MetadataConfig,
  type UploadPackage,
} from "../src/metadata";
import { parseScript, type Script } from "../src/schema/script";

const SCRIPTS = [
  "scripts/example-usememo.yaml",
  "scripts/nextjs-server-vs-client-components.yaml",
  "scripts/shopify-storefront-cart-resets.yaml",
];

const load = (path: string): Script => {
  const result = loadScriptFile(path);
  if (!result.success) throw new Error(result.errors.join("\n"));
  return result.data;
};

const allScripts = async (): Promise<string[]> =>
  (await readdir("scripts")).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => `scripts/${f}`);

const ALL = await allScripts();

const config: MetadataConfig = {
  channelName: "Test Channel",
  githubRepo: "https://github.com/example/repo",
  cta: "Follow Test Channel for more.",
  platforms: {
    youtube: { handle: "@testyt", hashtags: ["shorts", "frontend", "webdev"], tags: ["test channel", "coding"] },
    tiktok: { handle: "@testtt", hashtags: ["frontend", "webdev"] },
    instagram: { handle: "@testig", hashtags: ["frontend", "webdev", "coding"], cta: "Follow {handle} for more." },
  },
};

const minimal = (overrides: Partial<Script> = {}): Script => ({
  title: "Short title",
  scenes: [{ type: "outro", narration: "Bye now.", cta: "Bye" }],
  ...overrides,
});

const field = (pkg: UploadPackage, section: string, label: string): string => {
  const f = pkg.sections.find((s) => s.id === section)?.fields.find((x) => x.label === label);
  if (!f) throw new Error(`no ${section} ${label}`);
  return f.value;
};

const hashtagsIn = (text: string): string[] => text.match(/#[a-z0-9]+/g) ?? [];

/** A script without meta: title scene, explaining code scene, compare, outro. */
const noMeta: Script = {
  title: "Index as key scrambles state",
  scenes: [
    { type: "title", narration: "Your checkmark jumps.", heading: "The checkmark jumps rows", subheading: "React lists" },
    {
      type: "code",
      language: "tsx",
      code: "items.map((item, i) => <Row key={i} />)\n",
      narration: "React ties state to the key. With the index as the key, state follows the slot. That is the bug.",
    },
    {
      type: "compare",
      language: "tsx",
      wrong: { code: "<Row key={i} />" },
      right: { code: "<Row key={item.id} />\n" },
      narration: "Key by a stable ID.",
    },
    { type: "outro", narration: "Follow for more.", cta: "Follow for more" },
  ],
};

describe("schema meta block", () => {
  it("is optional and every field is optional", () => {
    expect(parseScript(minimal()).success).toBe(true);
    expect(parseScript(minimal({ meta: {} })).success).toBe(true);
    expect(parseScript(minimal({ meta: { hook: "Only a hook." } })).success).toBe(true);
  });

  it.each(ALL)("%s has a meta block with every field", (path) => {
    const meta = load(path).meta;
    expect(meta).toBeDefined();
    expect(Object.keys(meta!).sort()).toEqual(["fixCode", "hook", "summary", "topicTags", "youtubeTitle"]);
    expect([...meta!.youtubeTitle!].length).toBeLessThan(60);
  });

  it("rejects a YouTube title over the 100 character hard limit", () => {
    const result = parseScript(minimal({ meta: { youtubeTitle: "x".repeat(101) } }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]).toContain("meta.youtubeTitle");
    expect(parseScript(minimal({ meta: { youtubeTitle: "x".repeat(100) } })).success).toBe(true);
  });

  it("rejects a summary over 2 sentences, bad topic tags and em dashes", () => {
    expect(parseScript(minimal({ meta: { summary: "One. Two. Three." } })).success).toBe(false);
    // Dots inside code names are not sentence ends.
    expect(parseScript(minimal({ meta: { summary: "Use Object.freeze here. Then Array.isArray." } })).success).toBe(true);
    expect(parseScript(minimal({ meta: { topicTags: ["next js"] } })).success).toBe(false);
    expect(parseScript(minimal({ meta: { topicTags: ["#nextjs", "react"] } })).success).toBe(true);
    expect(parseScript(minimal({ meta: { hook: "Wait — what" } })).success).toBe(false);
  });
});

describe("fallbacks when meta is missing", () => {
  const meta = resolveMeta(noMeta);

  it("marks every field as generated", () => {
    expect(meta.generated.sort()).toEqual(["fixCode", "hook", "summary", "topicTags", "youtubeTitle"]);
    expect(resolveMeta(load(SCRIPTS[0]!)).generated).toEqual([]);
  });

  it("takes the hook from the title scene heading", () => {
    expect(meta.hook).toBe("The checkmark jumps rows.");
    expect(resolveMeta(minimal()).hook).toBe("Short title.");
  });

  it("takes the summary from the first 2 sentences of the explaining narration", () => {
    expect(meta.summary).toBe("React ties state to the key. With the index as the key, state follows the slot.");
  });

  it("takes the fix from the compare scene's right code, else the last code scene", () => {
    expect(meta.fixCode).toBe("<Row key={item.id} />");
    const withoutCompare = { ...noMeta, scenes: noMeta.scenes.filter((s) => s.type !== "compare") };
    expect(generateFixCode(withoutCompare)).toBe("items.map((item, i) => <Row key={i} />)");
    expect(generateFixCode(minimal())).toBeUndefined();
  });

  it("takes the title from the script and topic tags from its content", () => {
    expect(meta.youtubeTitle).toBe(buildTitles(noMeta)[0]);
    expect([...meta.youtubeTitle].length).toBeLessThan(60);
    expect(meta.topicTags).toEqual(["react", "typescript"]);
  });

  it("uses meta fields when present and fills only the missing ones", () => {
    const partial = resolveMeta({ ...noMeta, meta: { hook: "My hook.", topicTags: ["#NextJS"] } });
    expect(partial.hook).toBe("My hook.");
    expect(partial.topicTags).toEqual(["nextjs"]);
    expect(partial.generated.sort()).toEqual(["fixCode", "summary", "youtubeTitle"]);
  });

  it("leaves out the fix and warns when there is no code at all", () => {
    const pkg = buildUploadPackage(minimal(), "minimal", config);
    expect(pkg.sections.find((s) => s.id === "comment")!.fields).toEqual([]);
    expect(field(pkg, "youtube", "Description")).not.toContain("The fix:");
    expect(pkg.warnings.join("\n")).toContain("No fix code");
    expect(renderUploadMarkdown(pkg)).toContain("No fix code for this video.");
  });
});

describe("angle bracket sanitizing", () => {
  it("turns => into →, other < and > into ‹ ›", () => {
    expect(sanitizePlatformText("setCount(c => c + 1)")).toBe("setCount(c → c + 1)");
    expect(sanitizePlatformText("<Row key={id} />")).toBe("‹Row key={id} /›");
    expect(sanitizePlatformText("for (let i = 0; i < 3; i++) a >= b")).toBe("for (let i = 0; i ‹ 3; i++) a ›= b");
    expect(sanitizePlatformText("Wait — measure")).toBe("Wait, measure");
  });

  it("uses ⇒ in the pinned comment fallback", () => {
    expect(fallbackCode("useEffect(() => {}, [])")).toBe("useEffect(() ⇒ {}, [])");
    expect(fallbackCode("<Row />")).toBe("‹Row /›");
  });

  it.each(ALL)("keeps < and > out of every platform field but the comment for %s", (path) => {
    const script = load(path);
    const pkg = buildUploadPackage(script, slugFromPath(path), config);
    for (const section of pkg.sections) {
      for (const f of section.fields) {
        if (f.label === "Comment" || f.label === "Pinned comment") continue;
        expect(f.value, `${section.id} ${f.label}`).not.toMatch(/[<>]/);
        expect(f.value).not.toContain("—");
      }
    }
    // The pinned comment is the exact code.
    expect(field(pkg, "comment", "Comment")).toBe(script.meta!.fixCode!.replace(/\n+$/, ""));
    expect(field(pkg, "youtube", "Pinned comment")).toBe(field(pkg, "comment", "Comment"));
  });

  it("keeps the original code in the comment and the safe version in captions", () => {
    const pkg = buildUploadPackage(load("scripts/01-setstate-batching.yaml"), "01", config);
    expect(field(pkg, "comment", "Comment")).toBe("setCount(c => c + 1);");
    expect(field(pkg, "comment", "Fallback comment")).toBe("setCount(c ⇒ c + 1);");
    expect(field(pkg, "youtube", "Description")).toContain("setCount(c → c + 1);");
    expect(field(pkg, "tiktok", "Caption")).toContain("Fix: setCount(c → c + 1);");
    expect(field(pkg, "instagram", "Caption")).toContain("setCount(c → c + 1);");
  });
});

describe("hashtag caps per platform", () => {
  const many = ["react", "nextjs", "typescript", "javascript", "shopify"];

  it("YouTube: #shorts first, topic tags next, at most 8", () => {
    const tags = platformHashtags("youtube", many, { ...config, platforms: { ...config.platforms, youtube: { ...config.platforms.youtube, hashtags: ["a", "b", "c", "d", "shorts"] } } });
    expect(tags[0]).toBe("shorts");
    expect(tags.slice(1, 6)).toEqual(many);
    expect(tags).toHaveLength(LIMITS.youtube.maxHashtags);
  });

  it("TikTok: 4 to 6, padded when the script and config give too few", () => {
    const few = platformHashtags("tiktok", [], { ...config, platforms: { ...config.platforms, tiktok: { handle: "@t", hashtags: [] } } });
    expect(few.length).toBe(LIMITS.tiktok.minHashtags);
    const lots = platformHashtags("tiktok", many, config);
    expect(lots).toHaveLength(LIMITS.tiktok.maxHashtags);
    expect(lots.slice(0, 5)).toEqual(many);
  });

  it("Instagram: never more than 5", () => {
    expect(platformHashtags("instagram", many, config)).toEqual(many);
    expect(platformHashtags("instagram", ["react"], config)).toEqual(["react", "frontend", "webdev", "coding"]);
  });

  it("deduplicates and strips # and case", () => {
    expect(platformHashtags("instagram", ["#React", "react"], config)).toEqual(["react", "frontend", "webdev", "coding"]);
  });

  it.each(ALL)("captions for %s stay within each cap", (path) => {
    const meta = resolveMeta(load(path));
    const yt = hashtagsIn(youtubeDescription(meta, config));
    expect(yt[0]).toBe("#shorts");
    expect(yt.length).toBeLessThanOrEqual(LIMITS.youtube.maxHashtags);
    const tt = hashtagsIn(tiktokCaption(meta, config));
    expect(tt.length).toBeGreaterThanOrEqual(LIMITS.tiktok.minHashtags);
    expect(tt.length).toBeLessThanOrEqual(LIMITS.tiktok.maxHashtags);
    expect(hashtagsIn(instagramCaption(meta, config)).length).toBeLessThanOrEqual(LIMITS.instagram.maxHashtags);
  });
});

describe("length limits", () => {
  it.each(ALL)("%s: title under 60, tags under 500, TikTok under 300", (path) => {
    const pkg = buildUploadPackage(load(path), slugFromPath(path), config);
    expect([...field(pkg, "youtube", "Title")].length).toBeLessThan(LIMITS.youtube.titleTarget);
    expect(youtubeTagsLength(field(pkg, "youtube", "Tags").split(", "))).toBeLessThan(LIMITS.youtube.tags);
    expect([...field(pkg, "tiktok", "Caption")].length).toBeLessThan(LIMITS.tiktok.caption);
  });

  it("cuts a title over the 100 character hard limit at a word boundary", () => {
    const meta = { ...resolveMeta(noMeta), youtubeTitle: `${"word ".repeat(30)}end` };
    const title = youtubeTitle(meta);
    expect([...title].length).toBeLessThanOrEqual(LIMITS.youtube.titleHard);
    expect(title).toMatch(/^(word )*word$/);
  });

  it("warns about a title of 60 or more characters", () => {
    const long = "A specific searchable title that runs a little past sixty chars";
    const pkg = buildUploadPackage({ ...noMeta, meta: { youtubeTitle: long } }, "x", config);
    expect(field(pkg, "youtube", "Title")).toBe(long);
    expect(pkg.warnings.join("\n")).toContain("keep it under 60");
  });

  it("generated titles stay under 60 characters", () => {
    const long = "This is a very long title about a topic that just keeps going and going and going";
    const titles = buildTitles(minimal({ title: long, scenes: [{ type: "title", narration: "Hi.", heading: `${long} again` }] }));
    for (const t of titles) expect([...t].length).toBeLessThan(60);
    expect(truncateWords("one two three four", 10)).toBe("one two");
  });

  it("keeps the YouTube tags field under 500 characters however many tags the config has", () => {
    const big = { ...config, platforms: { ...config.platforms, youtube: { ...config.platforms.youtube, tags: Array.from({ length: 80 }, (_, i) => `long tag number ${i}`) } } };
    const tags = buildYoutubeTags(resolveMeta(noMeta), big);
    expect(youtubeTagsLength(tags)).toBeLessThan(500);
    expect(youtubeTagsLength(tags)).toBeGreaterThan(400);
    expect(youtubeTagsLength(["a b", "c"])).toBe(7); // "a b",c
  });

  it("shortens the TikTok caption until it fits", () => {
    const longSummary = `${"This explains the gotcha in some detail ".repeat(5).trim()}. ${"More words ".repeat(10).trim()}.`;
    const caption = tiktokCaption({ ...resolveMeta(noMeta), summary: longSummary }, config);
    expect([...caption].length).toBeLessThan(300);
    expect(caption.split("\n")[0]).toBe("The checkmark jumps rows.");
  });
});

describe("platform copy", () => {
  const script = load("scripts/02-index-as-key.yaml");
  const pkg = buildUploadPackage(script, "02-index-as-key", config);

  it("YouTube description: hook, summary, fix, CTA, GitHub link, then hashtags", () => {
    const parts = field(pkg, "youtube", "Description").split("\n\n");
    expect(parts[0]).toBe(script.meta!.hook);
    expect(parts[1]).toBe(script.meta!.summary);
    expect(parts[2]).toBe("The fix:\n‹TodoItem key={todo.id} todo={todo} /›");
    expect(parts[3]).toBe(config.cta);
    expect(parts[4]).toBe(`Code: ${config.githubRepo}`);
    expect(parts[5]).toMatch(/^#shorts #react/);
  });

  it("Instagram: hook alone on line 1, handle in the CTA", () => {
    const caption = field(pkg, "instagram", "Caption");
    expect(caption.split("\n")[0]).toBe(script.meta!.hook);
    expect(caption.split("\n")[1]).toBe("");
    expect(caption).toContain("Follow @testig for more.");
  });

  it("TikTok: hook first", () => {
    expect(field(pkg, "tiktok", "Caption").split("\n")[0]).toBe(script.meta!.hook);
  });

  it("has the platform checklists", () => {
    const list = (id: string) => pkg.sections.find((s) => s.id === id)!.checklist.join("\n");
    expect(list("youtube")).toMatch(/not made for kids/);
    expect(list("youtube")).toMatch(/Science & Technology/);
    expect(list("youtube")).toMatch(/Shorts tab/);
    expect(list("tiktok")).toMatch(/AI-generated content label: on/);
    expect(list("tiktok")).toMatch(/title frame/);
    expect(list("instagram")).toMatch(/Share to Facebook: on/);
    expect(list("instagram")).toContain("out/02-index-as-key/cover.png");
    expect(list("instagram")).toMatch(/centered/);
  });
});

describe("metadata.config.json", () => {
  it("is valid and holds the channel settings", () => {
    const repo = loadMetadataConfig();
    expect(repo.platforms.youtube.handle).toBe("@FrontendGotchas");
    expect(repo.cta).toBe("Follow Frontend Gotchas for a new frontend gotcha every day.");
    expect(repo.githubRepo).toMatch(/^https:\/\/github\.com\//);
  });

  it("rejects a bad handle or a missing platform", () => {
    expect(parseMetadataConfig({ ...config, platforms: { ...config.platforms, tiktok: { handle: "no at", hashtags: [] } } }).success).toBe(false);
    const { instagram: _, ...rest } = config.platforms;
    expect(parseMetadataConfig({ ...config, platforms: rest }).success).toBe(false);
  });

  it("warns while a handle is still a placeholder", () => {
    const placeholder = { ...config, platforms: { ...config.platforms, tiktok: { handle: "@TODO_tiktok_handle", hashtags: [] } } };
    expect(buildUploadPackage(noMeta, "x", placeholder).warnings.join("\n")).toContain("tiktok handle is still the placeholder");
    expect(buildUploadPackage(load(SCRIPTS[0]!), "x", config).warnings).toEqual([]);
  });
});

describe("renderUploadMarkdown and renderUploadHtml", () => {
  it.each(ALL)("%s: every field in a code block, no em dashes", (path) => {
    const pkg = buildUploadPackage(load(path), slugFromPath(path), config);
    const md = renderUploadMarkdown(pkg);
    for (const h of ["## YouTube Shorts", "## TikTok", "## Instagram Reels (and Facebook)", "## Pinned or first comment", "## Transcript"]) {
      expect(md).toContain(h);
    }
    for (const section of pkg.sections) for (const f of section.fields) expect(md).toContain(`\n${f.value}\n`);
    expect(md).not.toContain("—");
    const html = renderUploadHtml(pkg);
    const fields = pkg.sections.reduce((n, s) => n + s.fields.length, 0);
    expect(html.match(/<button class="copy"/g)).toHaveLength(fields);
    expect(html).not.toContain("—");
  });

  it("uses a longer fence when the code has backticks", () => {
    const pkg = buildUploadPackage({ ...noMeta, meta: { fixCode: "const s = ```;" } }, "x", config);
    expect(renderUploadMarkdown(pkg)).toContain("````text\nconst s = ```;\n````");
  });

  it("escapes code in the HTML so the copied text is exact", () => {
    const html = renderUploadHtml(buildUploadPackage(load("scripts/02-index-as-key.yaml"), "02", config));
    expect(html).toContain("&lt;TodoItem key={todo.id} todo={todo} /&gt;");
    expect(html).not.toContain("<TodoItem");
  });
});

describe("buildHashtags (generated topic tags)", () => {
  it.each(SCRIPTS)("gives 5 to 8 unique hashtags starting with #shorts for %s", (path) => {
    const tags = buildHashtags(load(path));
    expect(tags[0]).toBe("#shorts");
    expect(tags.length).toBeGreaterThanOrEqual(MIN_HASHTAGS);
    expect(tags.length).toBeLessThanOrEqual(MAX_HASHTAGS);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("picks topic tags from the script and its code languages", () => {
    expect(buildHashtags(load(SCRIPTS[1]!)).slice(0, 3)).toEqual(["#shorts", "#nextjs", "#react"]);
    expect(buildHashtags(load(SCRIPTS[2]!))[1]).toBe("#shopify");
    expect(buildHashtags(minimal())).toEqual(["#shorts", "#programming", "#webdev", "#coding", "#developer"]);
  });
});

describe("pnpm video metadata", () => {
  const run = (args: string[]) =>
    promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli/index.ts", ...args]).then(
      (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
      (e: { code: number; stdout: string; stderr: string }) => e,
    );

  it("writes out/<slug>/upload.md and upload.html", async () => {
    const r = await run(["metadata", SCRIPTS[0]!]);
    expect(r.code).toBe(0);
    const paths = pipelinePaths("example-usememo");
    const pkg = buildUploadPackage(load(SCRIPTS[0]!), "example-usememo", loadMetadataConfig(), {
      video: paths.video("short"),
      cover: paths.cover,
    });
    expect(await readFile(paths.upload, "utf8")).toBe(renderUploadMarkdown(pkg));
    expect(await readFile(paths.uploadHtml, "utf8")).toBe(renderUploadHtml(pkg));
  });

  it("--all runs every script in scripts/", async () => {
    const r = await run(["metadata", "--all"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`Wrote upload metadata for ${ALL.length} of ${ALL.length} scripts.`);
  });

  it("rejects --all on other commands and with a path", async () => {
    expect((await run(["render", "--all"])).stderr).toContain("--all only works with metadata");
    expect((await run(["metadata", SCRIPTS[0]!, "--all"])).stderr).toContain("not both");
  });
});
