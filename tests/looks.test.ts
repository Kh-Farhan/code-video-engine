import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captionBand, visualZone } from "../src/captions/layout";
import { blockSteps } from "../src/components/looks/blocks";
import { editorWindowLayout, lookVisualZone, wordmarkBox } from "../src/components/looks/layout";
import {
  filenameForLanguage,
  lookTimeline,
  moodAt,
  moodChanges,
  sceneMoodSteps,
} from "../src/components/looks/timeline";
import { compareRevealFrames } from "../src/scenes/timing";
import { parseScript, type Scene } from "../src/schema/script";
import {
  brand,
  colors,
  contrastRatio,
  FPS,
  lookColors,
  mixHex,
  platformSafeArea,
  presetNames,
  presets,
} from "../src/theme";

const base = { title: "T", scenes: [{ type: "title", heading: "Hello world", narration: "Hello there, friend." }] };

describe("brand tokens", () => {
  it("drive the caption word, bug and fix colors", () => {
    expect(colors.captionHighlight).toBe(brand.accent);
    expect(colors.brandAccent).toBe(brand.accent);
    expect(colors.danger).toBe(brand.bug);
    expect(colors.success).toBe(brand.fix);
    expect(colors.background).toBe(brand.base);
  });

  it("keep code text readable on the code surface every look uses", () => {
    // Code always sits on colors.surface (cards, compare panels, editor window).
    expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(brand.bug, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.fix, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.accent, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("contrast helpers behave", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#ff0000", "#00ff00", 0)).toBe("#ff0000");
  });
});

describe("blocks colors", () => {
  const all = [...lookColors.blocks.accent, ...lookColors.blocks.bug, ...lookColors.blocks.fix];

  it.each(all)("%s keeps white text and the amber caption word readable", (bg) => {
    expect(contrastRatio("#ffffff", bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.accent, bg)).toBeGreaterThanOrEqual(3);
  });

  it.each([...lookColors.blocks.accent])("calm color %s keeps red and green marks readable", (bg) => {
    expect(contrastRatio(brand.bug, bg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(brand.fix, bg)).toBeGreaterThanOrEqual(3);
  });

  it("never repeats a color on two neighbouring scenes", () => {
    const steps = blockSteps([
      { frame: 0, mood: "accent" },
      { frame: 10, mood: "accent" },
      { frame: 20, mood: "bug" },
      { frame: 30, mood: "bug" },
      { frame: 40, mood: "fix" },
      { frame: 50, mood: "fix" },
      { frame: 60, mood: "accent" },
    ]);
    expect(steps).toHaveLength(7);
    for (let i = 1; i < steps.length; i++) expect(steps[i]?.color).not.toBe(steps[i - 1]?.color);
    expect(steps[2]?.color).toBe(lookColors.blocks.bug[0]);
    expect(steps[4]?.color).toBe(lookColors.blocks.fix[0]);
  });
});

describe("aurora colors", () => {
  it("keep white text readable where a blob is brightest", () => {
    // The brightest blob center: alpha 0.42 of the color over the base.
    for (const mood of Object.values(lookColors.moods)) {
      for (const c of mood) {
        const peak = mixHex(brand.base, c, 0.42);
        expect(contrastRatio("#ffffff", peak)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("scene moods", () => {
  const compare: Scene = {
    type: "compare",
    wrong: { label: "a" },
    right: { label: "b" },
    narration: "Use a stable key.",
  };

  it("compare goes bug then fix when the right side lands", () => {
    const steps = sceneMoodSteps(compare, 300, FPS);
    expect(steps).toEqual([
      { at: 0, mood: "bug" },
      { at: compareRevealFrames(300, FPS).right, mood: "fix" },
    ]);
  });

  it("follows bug and fix words in the narration, and an explicit mood wins", () => {
    const text = (narration: string): Scene => ({ type: "text", text: "x", narration });
    expect(sceneMoodSteps(text("This is a classic bug."), 100, FPS)).toEqual([{ at: 0, mood: "bug" }]);
    expect(sceneMoodSteps(text("Here is the fix."), 100, FPS)).toEqual([{ at: 0, mood: "fix" }]);
    expect(sceneMoodSteps(text("Nothing special here."), 100, FPS)).toEqual([{ at: 0, mood: "accent" }]);
    const both = sceneMoodSteps(text("It looks wrong. Use a key instead."), 100, FPS);
    expect(both[0]?.mood).toBe("bug");
    expect(both[1]?.mood).toBe("fix");
    expect(both[1]?.at).toBeGreaterThan(30);
    expect(sceneMoodSteps({ ...text("The bug."), mood: "fix" }, 100, FPS)).toEqual([{ at: 0, mood: "fix" }]);
  });

  it("crossfades between moods", () => {
    const changes = moodChanges(
      lookTimeline(
        [
          { scene: { type: "text", text: "x", narration: "Calm." }, durationInFrames: 60 },
          { scene: compare, durationInFrames: 300 },
        ],
        FPS,
      ),
    );
    expect(changes[0]).toEqual({ frame: 0, mood: "accent" });
    expect(changes[1]).toEqual({ frame: 60, mood: "bug" });
    expect(moodAt(changes, 30, 15)).toEqual({ from: "accent", to: "accent", t: 1 });
    const mid = moodAt(changes, 60 + 7.5, 15);
    expect(mid.from).toBe("accent");
    expect(mid.to).toBe("bug");
    expect(mid.t).toBeCloseTo(0.5);
  });

  it("names editor tabs after the language", () => {
    expect(filenameForLanguage("tsx")).toBe("app.tsx");
    expect(filenameForLanguage("javascript")).toBe("script.js");
    const [code] = lookTimeline(
      [{ scene: { type: "code", language: "typescript", code: "x", narration: "x" }, durationInFrames: 10 }],
      FPS,
    );
    expect(code?.filename).toBe("index.ts");
  });
});

describe("look layout stays in the safe zones", () => {
  it.each(presetNames)("%s: the FG mark sits inside the safe area, clear of content", (preset) => {
    const box = wordmarkBox(preset);
    const safe = platformSafeArea[preset];
    const { width, height } = presets[preset];
    expect(box.left).toBeGreaterThanOrEqual(safe.left);
    expect(box.top).toBeGreaterThanOrEqual(safe.top);
    expect(box.left + box.width).toBeLessThanOrEqual(width - safe.right);
    expect(box.top + box.height).toBeLessThanOrEqual(height - safe.bottom);
    if (preset === "short") expect(box.left + box.width).toBeLessThanOrEqual(visualZone(preset).left);
    else expect(box.top + box.height).toBeLessThanOrEqual(visualZone(preset).top);
  });

  it.each(presetNames)("%s: the editor window ends above the captions", (preset) => {
    const { window } = editorWindowLayout(preset);
    expect(window.top).toBeGreaterThanOrEqual(platformSafeArea[preset].top);
    expect(window.top + window.height).toBeLessThanOrEqual(captionBand(preset).top);
    expect(window.left).toBeGreaterThan(0);
  });

  it.each(presetNames)("%s: editor content sits inside the visual zone, under the title bar", (preset) => {
    const zone = visualZone(preset);
    const inner = lookVisualZone(preset, "editor");
    expect(inner.top).toBeGreaterThan(zone.top + editorWindowLayout(preset).titleBarHeight);
    expect(inner.bottom).toBeGreaterThanOrEqual(zone.bottom);
    expect(inner.left).toBe(zone.left);
    expect(inner.right).toBe(zone.right);
    expect(lookVisualZone(preset, "grid")).toEqual(zone);
  });
});

describe("schema", () => {
  it("accepts the new looks and a scene mood", () => {
    for (const look of ["editor", "aurora", "blocks", "grid", "classic"]) {
      expect(parseScript({ ...base, style: { look } }).success).toBe(true);
    }
    const withMood = { ...base, scenes: [{ ...base.scenes[0], mood: "bug" }] };
    expect(parseScript(withMood).success).toBe(true);
    const badMood = { ...base, scenes: [{ ...base.scenes[0], mood: "angry" }] };
    expect(parseScript(badMood).success).toBe(false);
  });
});

describe("determinism", () => {
  it("look code never uses Math.random or Date", () => {
    const dir = join(__dirname, "../src/components/looks");
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).not.toMatch(/Math\.random|new Date|Date\.now/);
    }
  });
});
