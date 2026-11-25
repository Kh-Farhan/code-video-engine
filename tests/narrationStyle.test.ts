import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScriptFile } from "../src/cli/loadScript";
import { echoSimilarity, lintNarration, lintScript } from "../src/cli/narrationLint";
import { parseScript, type Script } from "../src/schema/script";

const rules = (text: string, onScreen: string[] = []) => lintNarration(text, 0, "scene", onScreen).map((w) => w.rule);

const script = (scenes: unknown[]): Script => {
  const parsed = parseScript({ title: "Style", scenes });
  if (!parsed.success) throw new Error(parsed.errors.join("\n"));
  return parsed.data;
};

describe("narration style linter", () => {
  it("flags statements of 3 words or fewer, but not short questions", () => {
    expect(rules("Sixteen removed that.")).toEqual(["short-sentence"]);
    expect(rules("Ready? [pause] You switched users, but the old draft stayed.")).toEqual([]);
    expect(rules("Why does the draft survive?")).toEqual([]);
    expect(rules("Next.js 15 has it, but 16 doesn't.")).toEqual([]);
  });

  it("flags three or more short sentences in a row, once per run", () => {
    const warnings = lintNarration("New user, old draft. Same spot here. Same state again. Then it keeps going for a while.");
    expect(warnings.map((w) => w.rule)).toEqual(["fragment-run"]);
    expect(warnings[0]!.phrase).toBe("New user, old draft. Same spot here. Same state again.");
    expect(rules("Same spot in the tree means the same state. React keeps it there.")).toEqual([]);
  });

  it("flags a sentence that reads the on-screen words aloud", () => {
    expect(echoSimilarity("Clicked five times, still shows zero.", "Clicked 5 times. Still shows 0.")).toBe(1);
    expect(rules("Both equal zero, not each other.", ["Both equal 0. Not each other."])).toEqual(["echoes-screen"]);
    expect(rules("Each one equals zero, but they are not equal to each other.", ["Both equal 0. Not each other."])).toEqual([]);
  });

  it("compares against the title heading, keyword and text of the same scene only", () => {
    const s = script([
      { type: "title", heading: "Switched users. Form didn't reset.", subheading: "React", narration: "Switched users, form didn't reset." },
      { type: "keyword", keyword: "NO MORE FALLBACK", narration: "No more fallback now." },
      { type: "text", text: "Same spot, same state.", narration: "Same spot in the tree means the same state." },
      { type: "outro", cta: "Follow for more gotchas", narration: "Follow for more gotchas like this one." },
    ]);
    expect(lintScript(s).map((w) => [w.scene, w.rule])).toEqual([
      [0, "echoes-screen"],
      [1, "echoes-screen"],
    ]);
  });

  it("every unpublished numbered script passes the style rules", () => {
    const PUBLISHED = new Set(["01", "02", "04", "07"]);
    const STYLE = new Set(["short-sentence", "echoes-screen", "fragment-run"]);
    for (const file of readdirSync("scripts").filter((f) => /^\d+-.*\.yaml$/.test(f))) {
      if (PUBLISHED.has(file.slice(0, 2))) continue;
      const result = loadScriptFile(join("scripts", file));
      if (!result.success) throw new Error(result.errors.join("\n"));
      expect(lintScript(result.data).filter((w) => STYLE.has(w.rule)).map((w) => w.message), file).toEqual([]);
    }
  });
});
