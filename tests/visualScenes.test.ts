import { describe, expect, it } from "vitest";
import { captionSafeBottom } from "../src/captions/layout";
import { buildHashtags } from "../src/metadata";
import { parseManifest } from "../src/schema/manifest";
import { parseScript, sceneSchema, sceneTypes } from "../src/schema/script";
import { flowBoxSize, flowCenterOffset, wrappedRows } from "../src/scenes/FlowScene";
import { outputFontSize } from "../src/scenes/OutputScene";
import { sceneBottomPadding, visualZoneSize } from "../src/scenes/SceneFrame";
import {
  codePunchScale,
  CODE_PUNCH_PULSE,
  CODE_PUNCH_SCALE,
  compareRevealFrames,
  outputRevealFrames,
  statRevealFrames,
} from "../src/scenes/timing";
import { previewVisualScenes, visualSceneManifest, type VisualPreviewName } from "../src/scenes/visualScenePreview";
import { presetNames, presets, visualZoneBottomPx } from "../src/theme";

/** Errors for a one-scene script, failing the test if it parsed. */
const errorsFor = (scene: Record<string, unknown>): string[] => {
  const result = parseScript({ title: "T", scenes: [{ narration: "Something is said here.", ...scene }] });
  if (result.success) throw new Error("expected the scene to be invalid");
  return result.errors;
};

const valid = (scene: Record<string, unknown>) =>
  parseScript({ title: "T", scenes: [{ narration: "Something is said here.", ...scene }] });

describe("scene types", () => {
  it("lists the new visual scene types alongside the originals", () => {
    expect(sceneTypes).toEqual([
      "title",
      "code",
      "text",
      "list",
      "outro",
      "compare",
      "keyword",
      "output",
      "flow",
      "stat",
    ]);
  });

  it("still accepts every original scene type", () => {
    const result = parseScript({
      title: "T",
      scenes: [
        { type: "title", heading: "H", narration: "Hi." },
        { type: "code", language: "tsx", code: "a\nb", highlight: [{ from: 1, to: 2 }], typing: true, narration: "Hi." },
        { type: "text", text: "A short phrase.", narration: "Hi." },
        { type: "list", items: ["one", "two"], narration: "Hi." },
        { type: "outro", cta: "Follow", narration: "Hi." },
      ],
    });
    expect(result).toMatchObject({ success: true });
  });

  it.each(Object.keys(previewVisualScenes) as VisualPreviewName[])(
    "preview %s is a valid scene and manifest",
    (name) => {
      expect(sceneSchema.safeParse(previewVisualScenes[name]).success).toBe(true);
      expect(parseManifest(visualSceneManifest(name))).toMatchObject({ success: true });
    },
  );
});

describe("compare scene", () => {
  it("accepts two labels or two code blocks with a language", () => {
    expect(valid({ type: "compare", wrong: { label: "key={i}" }, right: { label: "key={id}" } })).toMatchObject({
      success: true,
    });
    expect(
      valid({ type: "compare", language: "tsx", wrong: { code: "a()" }, right: { code: "b()" } }),
    ).toMatchObject({ success: true });
  });

  it("needs exactly one of code or label per side", () => {
    expect(errorsFor({ type: "compare", wrong: {}, right: { label: "x" } })).toEqual([
      "scenes[0].wrong: set exactly one of `code` or `label`",
    ]);
    expect(
      errorsFor({ type: "compare", language: "tsx", wrong: { code: "a", label: "b" }, right: { code: "c" } }),
    ).toEqual(["scenes[0].wrong: set exactly one of `code` or `label`"]);
  });

  it("rejects mixing code and label", () => {
    expect(
      errorsFor({ type: "compare", language: "tsx", wrong: { code: "a" }, right: { label: "b" } }),
    ).toEqual(["scenes[0].right: both sides must be `code` or both must be `label`"]);
  });

  it("requires a language for code and rejects it for labels", () => {
    expect(errorsFor({ type: "compare", wrong: { code: "a" }, right: { code: "b" } })).toEqual([
      "scenes[0].language: is required when the sides are code",
    ]);
    expect(
      errorsFor({ type: "compare", language: "tsx", wrong: { label: "a" }, right: { label: "b" } })[0],
    ).toMatch(/^scenes\[0\]\.language: only applies when the sides are code/);
  });

  it("keeps code blocks short", () => {
    const long = Array.from({ length: 7 }, (_, i) => `line${i}`).join("\n");
    expect(
      errorsFor({ type: "compare", language: "ts", wrong: { code: "a" }, right: { code: "b" } })[0],
    ).toMatch(/^scenes\[0\]\.language: /);
    expect(
      errorsFor({ type: "compare", language: "tsx", wrong: { code: long }, right: { code: "b" } }),
    ).toEqual([
      "scenes[0].wrong.code: must be at most 6 lines (has 7); use a `code` scene for longer code",
    ]);
    expect(
      errorsFor({ type: "compare", language: "tsx", wrong: { code: "x".repeat(49) }, right: { code: "b" } }),
    ).toEqual(["scenes[0].wrong.code: line 1 is 49 characters, at most 48 fit side by side"]);
  });

  it("rejects em dashes and unknown fields in labels", () => {
    expect(errorsFor({ type: "compare", wrong: { label: "a — b" }, right: { label: "c" } })[0]).toMatch(
      /^scenes\[0\]\.wrong\.label: must not contain em dashes/,
    );
    expect(
      errorsFor({ type: "compare", wrong: { lable: "a" }, right: { label: "c" } }).join("\n"),
    ).toContain("lable");
  });
});

describe("keyword scene", () => {
  it("accepts 1 to 3 words", () => {
    expect(valid({ type: "keyword", keyword: "SNAPSHOT" })).toMatchObject({ success: true });
    expect(valid({ type: "keyword", keyword: "STABLE ID" })).toMatchObject({ success: true });
    expect(valid({ type: "keyword", keyword: "ONE TWO THREE" })).toMatchObject({ success: true });
  });

  it("rejects more than 3 words, sentences, and empty keywords", () => {
    expect(errorsFor({ type: "keyword", keyword: "one two three four" })).toEqual([
      "scenes[0].keyword: must be 1 to 3 words; use `text` for a phrase",
    ]);
    expect(errorsFor({ type: "keyword", keyword: "Use keys." })).toEqual([
      "scenes[0].keyword: is a keyword, not a sentence: drop the final punctuation",
    ]);
    expect(errorsFor({ type: "keyword", keyword: "  " })[0]).toMatch(/^scenes\[0\]\.keyword: must not be empty/);
  });

  it("rejects a keyword that just repeats the narration", () => {
    expect(
      parseScript({ title: "T", scenes: [{ type: "keyword", keyword: "Stable ID", narration: "Stable ID." }] }),
    ).toEqual({
      success: false,
      errors: ["scenes[0].keyword: must not repeat the narration; captions already show it"],
    });
  });
});

describe("output scene", () => {
  it("accepts lines with an optional command and title", () => {
    expect(valid({ type: "output", lines: ["[1, 10, 2]"] })).toMatchObject({ success: true });
    const result = valid({ type: "output", command: "node a.js", title: "Console", lines: ["a", "  indented"] });
    expect(result.success && result.data.scenes[0]).toMatchObject({ lines: ["a", "  indented"] });
  });

  it("needs 1 to 6 non-empty lines", () => {
    expect(errorsFor({ type: "output", lines: [] })).toEqual(["scenes[0].lines: needs at least one output line"]);
    expect(errorsFor({ type: "output", lines: Array(7).fill("x") })).toEqual([
      "scenes[0].lines: has at most 6 output lines",
    ]);
    expect(errorsFor({ type: "output", lines: ["ok", "   "] })).toEqual(["scenes[0].lines[1]: must not be empty"]);
    expect(errorsFor({ type: "output", lines: ["x".repeat(61)] })).toEqual([
      "scenes[0].lines[0]: must be at most 60 characters",
    ]);
  });
});

describe("flow scene", () => {
  it("accepts 2 to 4 steps", () => {
    expect(valid({ type: "flow", steps: ["render", "hydrate"] })).toMatchObject({ success: true });
  });

  it("rejects too few or too many steps", () => {
    expect(errorsFor({ type: "flow", steps: ["render"] })).toEqual(["scenes[0].steps: a flow needs at least 2 steps"]);
    expect(errorsFor({ type: "flow", steps: ["a", "b", "c", "d", "e"] })).toEqual([
      "scenes[0].steps: a flow has at most 4 steps",
    ]);
  });
});

describe("stat scene", () => {
  it("accepts a value and label with an optional from value", () => {
    expect(valid({ type: "stat", value: "+3", label: "renders" })).toMatchObject({ success: true });
    expect(valid({ type: "stat", from: "+1", value: "+3", label: "renders" })).toMatchObject({ success: true });
  });

  it("reports missing and oversized fields", () => {
    expect(errorsFor({ type: "stat", value: "+3" })).toEqual([
      expect.stringMatching(/^scenes\[0\]\.label: /),
    ]);
    expect(errorsFor({ type: "stat", value: "1234567890123", label: "x" })).toEqual([
      "scenes[0].value: must be at most 12 characters",
    ]);
  });
});

describe("visual zone", () => {
  it.each(presetNames)("%s: the zone ends above the caption band", (preset) => {
    const { height } = presets[preset];
    expect(visualZoneBottomPx(preset)).toBeLessThanOrEqual(height - captionSafeBottom(preset));
    expect(height - sceneBottomPadding(preset)).toBeLessThanOrEqual(visualZoneBottomPx(preset));
    const zone = visualZoneSize(preset);
    expect(zone.width).toBeGreaterThan(0);
    expect(zone.height).toBeGreaterThan(height * 0.4);
  });
});

describe("reveal timing", () => {
  it("compare shows the wrong side first, then the right side", () => {
    const at = compareRevealFrames(300, 30);
    expect(at.wrong).toBe(9);
    expect(at.right).toBe(120);
    const tiny = compareRevealFrames(4, 30);
    expect(tiny.right).toBeGreaterThan(tiny.wrong);
    expect(tiny.right).toBeLessThan(4);
  });

  it("stat lands the value after the from value", () => {
    expect(statRevealFrames(300, 30, false)).toEqual({ from: 9, value: 9 });
    const withFrom = statRevealFrames(300, 30, true);
    expect(withFrom.value).toBeGreaterThan(withFrom.from);
  });

  it("output reveals lines in order after the command", () => {
    const { commandEnd, lines } = outputRevealFrames(3, 300, 30, true);
    expect(commandEnd).toBeGreaterThan(0);
    expect(lines[0]).toBeGreaterThan(commandEnd);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(lines.every((f) => f < 300)).toBe(true);
    expect(outputRevealFrames(2, 300, 30, false).commandEnd).toBe(0);
  });
});

describe("codePunchScale", () => {
  it("drifts slowly without highlights", () => {
    expect(codePunchScale(0, 100, 0, 0, 12)).toBe(1);
    expect(codePunchScale(99, 100, 0, 0, 12)).toBeCloseTo(1.02);
  });

  it("waits for the highlight, punches in, and bumps on each step", () => {
    expect(codePunchScale(10, 200, 2, 50, 12)).toBe(1);
    expect(codePunchScale(50 + 12, 200, 2, 50, 12)).toBeCloseTo(CODE_PUNCH_SCALE);
    // Halfway through the move into step 2 the pulse peaks.
    expect(codePunchScale(125 + 6, 200, 2, 50, 12)).toBeCloseTo(CODE_PUNCH_SCALE + CODE_PUNCH_PULSE);
    expect(codePunchScale(199, 200, 2, 50, 12)).toBeCloseTo(CODE_PUNCH_SCALE);
  });

  it("is deterministic", () => {
    expect(codePunchScale(77, 200, 3, 0, 12)).toBe(codePunchScale(77, 200, 3, 0, 12));
  });
});

describe("metadata", () => {
  it("picks up language tags from compare scenes", () => {
    const result = parseScript({
      title: "Keys",
      scenes: [{ type: "compare", language: "tsx", wrong: { code: "a" }, right: { code: "b" }, narration: "Hi." }],
    });
    if (!result.success) throw new Error(result.errors.join("\n"));
    expect(buildHashtags(result.data)).toContain("#react");
  });
});

describe("flow layout", () => {
  it("wraps labels between words", () => {
    expect(wrappedRows("Server render", 20)).toBe(1);
    expect(wrappedRows("Server render", 8)).toBe(2);
    expect(wrappedRows("abcdefghij", 4)).toBe(3);
  });

  it("gives every box one size that fits the zone", () => {
    for (const preset of presetNames) {
      const steps = ["Query with country: CA", "Shopper in Canada", "Prices in CAD", "Done"];
      const box = flowBoxSize(steps, preset);
      const zone = visualZoneSize(preset);
      expect(box.width).toBeLessThanOrEqual(zone.width);
      if (preset === "short") expect(steps.length * box.height).toBeLessThan(zone.height);
    }
  });

  it("centres the revealed boxes and ends at no offset", () => {
    expect(flowCenterOffset(1, 3, 100, 20)).toBe(120);
    expect(flowCenterOffset(2, 3, 100, 20)).toBe(60);
    expect(flowCenterOffset(3, 3, 100, 20)).toBe(0);
    expect(flowCenterOffset(0, 3, 100, 20)).toBe(120);
  });
});

describe("output font size", () => {
  it("keeps short at the 48px phone minimum and wraps instead", () => {
    expect(outputFontSize(["x".repeat(60), "[1, 10, 2]"], "short")).toBe(48);
    expect(outputFontSize(["A", "B"], "short")).toBe(48);
  });

  it("only drops below 48 in short when wrapped lines would overflow", () => {
    const six = Array(7).fill("x".repeat(60));
    expect(outputFontSize(six, "short")).toBeLessThan(48);
  });

  it("shrinks long lines in long rather than wrapping", () => {
    expect(outputFontSize(["x".repeat(20)], "long")).toBe(44);
    // A 60 character command plus its "$ " prompt.
    expect(outputFontSize(["x".repeat(62)], "long")).toBeLessThan(44);
  });
});
