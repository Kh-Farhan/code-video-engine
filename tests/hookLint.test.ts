import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOOK_MIN_FONT_SIZE, lintHook } from "../src/cli/hookLint";
import { loadScriptFile } from "../src/cli/loadScript";
import type { Script } from "../src/schema/script";

const scenes = (...s: object[]) => ({ scenes: s as Script["scenes"] });

describe("hook lint", () => {
  it("passes a title with a short heading and a short topic tag", () => {
    expect(lintHook(scenes({ type: "title", heading: "Your euro store says $29.99", subheading: "Shopify", narration: "x" }))).toEqual([]);
  });

  it("warns when the first scene is not a title", () => {
    expect(lintHook(scenes({ type: "text", text: "Hi", narration: "x" }))[0]!.message).toMatch(/not a title/);
  });

  it("warns when the heading is too long to hit hard", () => {
    const [w] = lintHook(scenes({
      type: "title",
      heading: "Marked 'use client'. Crashed: window is not defined.",
      subheading: "Next.js",
      narration: "x",
    }));
    expect(w!.message).toMatch(new RegExp(`${HOOK_MIN_FONT_SIZE}px`));
  });

  it("warns about a missing or sentence-long topic tag", () => {
    expect(lintHook(scenes({ type: "title", heading: "Short hook here", narration: "x" }))[0]!.message).toMatch(/no topic tag/);
    expect(
      lintHook(scenes({ type: "title", heading: "Short hook here", subheading: "Asked in a frontend interview", narration: "x" }))[0]!.message,
    ).toMatch(/1 to 4 words/);
  });

  it("every numbered (publishable) script meets the Shorts hook standard", () => {
    for (const file of readdirSync("scripts").filter((f) => /^\d+-.*\.yaml$/.test(f))) {
      const result = loadScriptFile(join("scripts", file));
      if (!result.success) throw new Error(result.errors.join("\n"));
      expect(lintHook(result.data).map((w) => w.message), file).toEqual([]);
    }
  });
});
