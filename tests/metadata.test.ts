import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { loadScriptFile } from "../src/cli/loadScript";
import { pipelinePaths } from "../src/cli/paths";
import {
  buildHashtags,
  buildSummary,
  buildTakeaway,
  buildTitles,
  buildTranscript,
  buildUploadMetadata,
  descriptionText,
  MAX_HASHTAGS,
  MIN_HASHTAGS,
  renderUploadMarkdown,
  truncateWords,
} from "../src/metadata";
import type { Script } from "../src/schema/script";

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

const minimal = (overrides: Partial<Script> = {}): Script => ({
  title: "Short title",
  scenes: [{ type: "outro", narration: "Bye now.", cta: "Bye" }],
  ...overrides,
});

describe("buildTitles", () => {
  it.each(SCRIPTS)("gives 3 distinct titles under 60 characters for %s", (path) => {
    const titles = buildTitles(load(path));
    expect(titles).toHaveLength(3);
    expect(new Set(titles.map((t) => t.toLowerCase())).size).toBe(3);
    for (const t of titles) expect([...t].length).toBeLessThan(60);
  });

  it("uses the script title and the title scene heading", () => {
    const titles = buildTitles(load(SCRIPTS[0]!));
    expect(titles).toContain("When NOT to use useMemo");
    expect(titles).toContain("Stop wrapping everything in useMemo");
  });

  it("skips a script title that is too long and still finds 3 options", () => {
    const titles = buildTitles(load(SCRIPTS[1]!));
    expect(titles).not.toContain("Server vs Client Components in Next.js App Router in 60 seconds");
    expect(titles[0]).toBe("Server vs Client Components");
  });

  it("cuts very long titles at a word boundary", () => {
    const long = "This is a very long title about a topic that just keeps going and going and going";
    const titles = buildTitles(
      minimal({
        title: long,
        scenes: [{ type: "title", narration: "Hi.", heading: `${long} again` }],
      }),
    );
    expect(titles.length).toBeGreaterThan(0);
    for (const t of titles) {
      expect([...t].length).toBeLessThan(60);
      expect(long + " again #shorts").toContain(t.replace(/ #shorts$/, ""));
    }
  });
});

describe("truncateWords", () => {
  it("leaves short text alone and cuts long text between words", () => {
    expect(truncateWords("short", 10)).toBe("short");
    expect(truncateWords("one two three four", 10)).toBe("one two");
    expect(truncateWords("one, two three", 5)).toBe("one");
  });
});

describe("description", () => {
  it("summarises with the heading and subheading in one sentence", () => {
    expect(buildSummary(load(SCRIPTS[0]!))).toBe(
      "Stop wrapping everything in useMemo: three cases where it makes React slower, not faster.",
    );
    expect(buildSummary(load(SCRIPTS[2]!))).toBe(
      "Why your Shopify cart keeps resetting: a Storefront API bug and the fix.",
    );
    expect(buildSummary(load(SCRIPTS[1]!))).toBe(
      "Server vs Client Components: the Next.js App Router in 60 seconds.",
    );
  });

  it("falls back to the title without a title scene", () => {
    expect(buildSummary(minimal())).toBe("Short title.");
  });

  it("takes the key takeaway from the text scene", () => {
    expect(buildTakeaway(load(SCRIPTS[1]!))).toBe(
      "Every component in the app folder is a Server Component by default.",
    );
    expect(buildTakeaway(minimal())).toBeUndefined();
  });

  it("ends with a follow line, using the brand handle when set", () => {
    const meta = buildUploadMetadata(minimal({ brand: { handle: "@devtips" } }));
    expect(meta.description.follow).toBe("Follow @devtips for more quick developer tips.");
    const text = descriptionText(buildUploadMetadata(load(SCRIPTS[0]!)));
    expect(text).toContain("Key takeaway: Case three");
    expect(text).toContain("Follow for more quick developer tips.");
  });
});

describe("buildHashtags", () => {
  it.each(SCRIPTS)("gives 5 to 8 unique hashtags starting with #shorts for %s", (path) => {
    const tags = buildHashtags(load(path));
    expect(tags[0]).toBe("#shorts");
    expect(tags.length).toBeGreaterThanOrEqual(MIN_HASHTAGS);
    expect(tags.length).toBeLessThanOrEqual(MAX_HASHTAGS);
    expect(new Set(tags).size).toBe(tags.length);
    for (const t of tags) expect(t).toMatch(/^#[a-z0-9]+$/);
  });

  it("picks topic tags from the script and its code languages", () => {
    expect(buildHashtags(load(SCRIPTS[0]!))).toEqual(
      expect.arrayContaining(["#react", "#typescript"]),
    );
    expect(buildHashtags(load(SCRIPTS[1]!)).slice(0, 3)).toEqual(["#shorts", "#nextjs", "#react"]);
    expect(buildHashtags(load(SCRIPTS[2]!))[1]).toBe("#shopify");
  });

  it("pads a script with no known topics up to 5 tags", () => {
    const tags = buildHashtags(minimal());
    expect(tags).toEqual(["#shorts", "#programming", "#webdev", "#coding", "#developer"]);
  });
});

describe("renderUploadMarkdown", () => {
  it.each(SCRIPTS)("has every section and no em dashes for %s", (path) => {
    const script = load(path);
    const md = renderUploadMarkdown(script);
    for (const h of ["## Title options", "## Description", "## Hashtags", "## Transcript"]) {
      expect(md).toContain(h);
    }
    expect(md).not.toContain("—");
    expect(md).toContain("#shorts");
  });

  it("includes the full narration as the transcript", () => {
    const script = load(SCRIPTS[0]!);
    const transcript = buildTranscript(script);
    expect(transcript).toHaveLength(script.scenes.length);
    const md = renderUploadMarkdown(script);
    for (const paragraph of transcript) expect(md).toContain(paragraph);
  });

  it("strips em dashes even if they slip past the schema", () => {
    const script = minimal({
      title: "Memo it — once",
      scenes: [{ type: "outro", narration: "Wait — measure first.", cta: "Bye" }],
    });
    const md = renderUploadMarkdown(script);
    expect(md).not.toContain("—");
    expect(md).toContain("Memo it, once");
    expect(md).toContain("Wait, measure first.");
  });
});

describe("pnpm video metadata", () => {
  const run = (args: string[]) =>
    promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli/index.ts", ...args]).then(
      (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
      (e: { code: number; stdout: string; stderr: string }) => e,
    );

  it("writes out/<slug>/upload.md", async () => {
    const r = await run(["metadata", SCRIPTS[0]!]);
    expect(r.code).toBe(0);
    const md = await readFile(pipelinePaths("example-usememo").upload, "utf8");
    expect(md).toBe(renderUploadMarkdown(load(SCRIPTS[0]!)));
  });

  it("--all runs every script in scripts/", async () => {
    const r = await run(["metadata", "--all"]);
    expect(r.code).toBe(0);
    const n = (await readdir("scripts")).filter((f) => /\.ya?ml$/.test(f)).length;
    expect(r.stdout).toContain(`Wrote upload metadata for ${n} of ${n} scripts.`);
  });

  it("rejects --all on other commands and with a path", async () => {
    expect((await run(["render", "--all"])).stderr).toContain("--all only works with metadata");
    expect((await run(["metadata", SCRIPTS[0]!, "--all"])).stderr).toContain("not both");
  });
});
