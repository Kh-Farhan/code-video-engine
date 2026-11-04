import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScriptFile } from "../src/cli/loadScript";
import { pipelinePaths } from "../src/cli/paths";
import type { Script } from "../src/schema/script";
import {
  accentWordIndex,
  fitHeadline,
  fitLine,
  headlineFromScript,
  snippetFromScript,
  tagFromScript,
  thumbnailCompositionIds,
  thumbnailContent,
  thumbnailFormatNames,
  thumbnailFormats,
  thumbnailSizes,
} from "../src/thumbnail";
import { longHeadingThumbnailScript, sampleThumbnailScript } from "../src/thumbnail/fixtures";
import { measureInterBold } from "../src/thumbnail/interMetrics";

const withTitle = (heading: string, subheading?: string): Script => ({
  title: "Fallback title",
  scenes: [{ type: "title", heading, subheading, narration: "Hello there." }],
});

const exampleScripts = readdirSync("scripts")
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => {
    const result = loadScriptFile(`scripts/${f}`);
    if (!result.success) throw new Error(result.errors.join("\n"));
    return [f, result.data] as const;
  });

describe("headlineFromScript", () => {
  it("uses the title scene heading as written when it is short", () => {
    expect(headlineFromScript(withTitle("Stop wrapping everything in useMemo"))).toBe(
      "Stop wrapping everything in useMemo",
    );
  });

  it("keeps the first clause of a long heading", () => {
    expect(
      headlineFromScript(withTitle("Server Components: what they are and why they ship less JavaScript")),
    ).toBe("Server Components");
  });

  it("cuts to six words when there is no short clause", () => {
    expect(
      headlineFromScript(withTitle("Why your Shopify Storefront API cart keeps resetting on every page load")),
    ).toBe("Why your Shopify Storefront API cart");
  });

  it("falls back to the script title without a title scene", () => {
    const script: Script = { title: "Fast loops in Go.", scenes: [{ type: "text", text: "Hi.", narration: "Hi." }] };
    expect(headlineFromScript(script)).toBe("Fast loops in Go");
  });
});

describe("tagFromScript", () => {
  it("uses the subheading up to its first clause", () => {
    expect(tagFromScript(withTitle("H", "Three cases where it makes React slower, not faster"))).toBe(
      "Three cases where it makes React slower",
    );
    expect(tagFromScript(withTitle("H", "The Next.js App Router in 60 seconds"))).toBe(
      "The Next.js App Router in 60 seconds",
    );
  });

  it("is absent without a subheading", () => {
    expect(tagFromScript(withTitle("H"))).toBeUndefined();
  });
});

describe("snippetFromScript", () => {
  const code = (src: string[], highlight?: { from: number; to: number }[]): Script => ({
    title: "T",
    scenes: [{ type: "code", language: "typescript", code: src.join("\n"), highlight, narration: "Code." }],
  });

  it("starts at the top when the first highlight fits", () => {
    const s = snippetFromScript(code(["a", "b", "c", "d"], [{ from: 2, to: 3 }]), 3)!;
    expect([s.start, s.end, s.highlighted]).toEqual([0, 3, [1, 2]]);
  });

  it("moves to the first highlight, with one line of context above", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    const s = snippetFromScript(code(lines, [{ from: 12, to: 13 }]), 4)!;
    expect([s.start, s.end, s.highlighted]).toEqual([10, 14, [11, 12]]);
  });

  it("removes shared indentation and skips blank edges", () => {
    const s = snippetFromScript(code(["", "    if (x) {", "      y();", "    }", ""]), 8)!;
    expect([s.start, s.end, s.indent]).toEqual([1, 4, 4]);
  });

  it("is absent without a code scene", () => {
    expect(snippetFromScript(withTitle("H"), 5)).toBeUndefined();
  });
});

describe("accentWordIndex", () => {
  it("prefers a headline word that is an identifier in the code", () => {
    expect(accentWordIndex("Stop wrapping everything in useMemo", "const a = useMemo(() => 1)")).toBe(4);
  });

  it("falls back to the last word", () => {
    expect(accentWordIndex("Server vs Client Components", "export default function Page() {}")).toBe(3);
    expect(accentWordIndex("One two three")).toBe(2);
  });
});

describe("fitHeadline", () => {
  const box = { maxWidth: 760, maxHeight: 430, maxLines: 3, minFontSize: 64, maxFontSize: 150, lineHeight: 1.04 };

  it("keeps a short headline on one line at the largest size", () => {
    const fit = fitHeadline({ ...box, text: "Go" });
    expect(fit).toEqual({ fontSize: 150, lines: ["Go"] });
  });

  it("balances lines and keeps every word, in order", () => {
    const text = "Stop wrapping everything in useMemo";
    const fit = fitHeadline({ ...box, text });
    expect(fit.lines.join(" ")).toBe(text);
    expect(fit.lines.length).toBeGreaterThan(1);
  });

  it("gets smaller as the text gets longer", () => {
    const a = fitHeadline({ ...box, text: "Fast loops" }).fontSize;
    const b = fitHeadline({ ...box, text: "Fast loops in Go without allocations" }).fontSize;
    expect(b).toBeLessThan(a);
  });
});

describe("fitLine", () => {
  it("shrinks before cutting, then cuts at a word with an ellipsis", () => {
    expect(fitLine({ text: "SHORT", maxWidth: 800, minFontSize: 20, maxFontSize: 30 }).fontSize).toBe(30);
    const cut = fitLine({ text: "A VERY LONG TOPIC TAG THAT WILL NOT FIT", maxWidth: 300, minFontSize: 28, maxFontSize: 30 });
    expect(cut.fontSize).toBe(28);
    expect(cut.text.endsWith("...")).toBe(true);
    expect(measureInterBold(cut.text) * cut.fontSize).toBeLessThanOrEqual(300);
  });
});

describe("thumbnailContent", () => {
  const scripts = [
    ...exampleScripts,
    ["fixture: sample", sampleThumbnailScript] as const,
    ["fixture: long heading", longHeadingThumbnailScript] as const,
  ];

  for (const format of thumbnailFormatNames) {
    const f = thumbnailFormats[format];
    for (const [name, script] of scripts) {
      it(`${name} fits the ${format} format`, () => {
        const { headline, tag, snippet } = thumbnailContent(script, f);
        const words = headline.lines.join(" ").split(" ");
        expect(words.length).toBeLessThanOrEqual(7);
        expect(headline.lines.length).toBeLessThanOrEqual(f.headline.maxLines);
        expect(headline.fontSize).toBeGreaterThanOrEqual(f.headline.minFontSize);
        expect(headline.lines.length * headline.fontSize * f.headline.lineHeight).toBeLessThanOrEqual(
          f.headline.maxHeight,
        );
        for (const line of headline.lines) {
          expect(measureInterBold(line, f.headline.letterSpacingEm) * headline.fontSize).toBeLessThanOrEqual(
            f.textWidth,
          );
        }
        expect(headline.accentWord).toBeLessThan(words.length);
        if (tag) {
          expect(measureInterBold(tag.text, f.tag.letterSpacingEm) * tag.fontSize).toBeLessThanOrEqual(
            f.textWidth - 2 * f.tag.padX,
          );
        }
        expect(snippet).toBeDefined();
        expect(snippet!.end - snippet!.start).toBeLessThanOrEqual(f.code.lines);
      });
    }
  }

  it("has no em dashes in any generated copy", () => {
    for (const [, script] of scripts) {
      for (const f of Object.values(thumbnailFormats)) {
        const { headline, tag } = thumbnailContent(script, f);
        expect(`${headline.lines.join(" ")} ${tag?.text ?? ""}`).not.toContain("—");
      }
    }
  });
});

describe("thumbnail outputs", () => {
  it("uses 1280x720 and 1080x1920 stills", () => {
    expect(thumbnailSizes.landscape).toEqual({ width: 1280, height: 720 });
    expect(thumbnailSizes.cover).toEqual({ width: 1080, height: 1920 });
    expect(thumbnailCompositionIds).toEqual({ landscape: "Thumbnail", cover: "ShortsCover" });
  });

  it("writes out/<slug>/thumbnail.png and cover.png", () => {
    const paths = pipelinePaths("demo");
    expect(paths.thumbnailImage).toBe("out/demo/thumbnail.png");
    expect(paths.cover).toBe("out/demo/cover.png");
  });
});
