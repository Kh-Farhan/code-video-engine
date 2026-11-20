import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  estimateTitleSeconds,
  headingWordCount,
  HOOK_MIN_FONT_SIZE,
  lintHook,
  measuredTitleSeconds,
  TITLE_MAX_HEADING_WORDS,
  TITLE_MAX_NARRATION_SECONDS,
} from "../src/cli/hookLint";
import { loadScriptFile } from "../src/cli/loadScript";
import type { Script } from "../src/schema/script";

const scenes = (...s: object[]) => ({ scenes: s as Script["scenes"] });

/** Already published (see scripts/POSTING_ORDER.md): not rewritten, so exempt from the length rules. */
const PUBLISHED = new Set(["01", "02", "04", "07"]);
const LENGTH_RULES = /\d+ words: keep it|title narration runs/;

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

  it("warns when a text heading is over 6 words, but not a code heading", () => {
    const [w] = lintHook(scenes({ type: "title", heading: "One two three four five six seven", subheading: "React", narration: "Short." }));
    expect(w!.message).toMatch(new RegExp(`7 words: keep it to ${TITLE_MAX_HEADING_WORDS}`));
    expect(lintHook(scenes({ type: "title", heading: "[1, 2, 10].sort() gives [1, 10, 2]", subheading: "JavaScript", narration: "Short." }))).toEqual([]);
  });

  it("does not count punctuation-only tokens as heading words", () => {
    expect(headingWordCount("0.1 + 0.2 is not 0.3")).toBe(5);
    expect(headingWordCount("Two identical arrays. === says false.")).toBe(5);
  });

  it("warns when the title narration is longer than 2.2 seconds", () => {
    const title = (narration: string) => scenes({ type: "title", heading: "Short hook here", subheading: "React", narration });
    expect(lintHook(title("The old user's text stayed."))).toEqual([]);
    const [w] = lintHook(title("You switch users, and the form still shows the old user's text."));
    expect(TITLE_MAX_NARRATION_SECONDS).toBe(2.2);
    expect(w!.message).toMatch(/runs 4\.8s \(estimated from word count\).*2\.2s or less.*scene 2/);
  });

  it("estimates at the script's speed and counts pause markers", () => {
    expect(estimateTitleSeconds("one two three four five six")).toBeCloseTo(2.4);
    expect(estimateTitleSeconds("one two three four five six", 1.2)).toBeCloseTo(2);
    expect(estimateTitleSeconds("one two [pause] three [pause:500]")).toBeCloseTo(1.2 + 0.8);
    const six = { scenes: scenes({ type: "title", heading: "Short hook", subheading: "React", narration: "one two three four five six" }).scenes };
    expect(lintHook({ ...six, voice: { speed: 1.2 } })).toEqual([]);
    expect(lintHook(six)).toHaveLength(1);
  });

  it("uses the real duration when audio exists", () => {
    const s = scenes({ type: "title", heading: "Short hook", subheading: "React", narration: "one two three" });
    expect(lintHook(s, { titleSeconds: 2.5 })[0]!.message).toMatch(/runs 2\.5s \(measured from the audio\)/);
    const word = (endMs: number) => ({ text: "w", startMs: endMs - 100, endMs, timestampMs: null, confidence: null });
    expect(measuredTitleSeconds(s, { scenes: [{ words: { source: "aligned", captions: [word(300), word(900), word(1400)] } }] } as never)).toBe(1.4);
    // A manifest voiced from a different narration is ignored.
    expect(measuredTitleSeconds(s, { scenes: [{ words: { source: "aligned", captions: [word(300)] } }] } as never)).toBeUndefined();
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
      const published = PUBLISHED.has(file.slice(0, 2));
      const messages = lintHook(result.data).map((w) => w.message);
      expect(published ? messages.filter((m) => !LENGTH_RULES.test(m)) : messages, file).toEqual([]);
    }
  });
});
