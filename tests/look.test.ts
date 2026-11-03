import { describe, expect, it } from "vitest";
import { chunkWords } from "../src/captions/chunk";
import { captionChunkOptions, captionFontSize, captionSafeBottom } from "../src/captions/layout";
import { distributeWordTimings } from "../src/captions/timing";
import { buildManifest } from "../src/cli/manifest";
import { hash01 } from "../src/components/Backdrop";
import { sceneTransitionStyle, staggeredWords } from "../src/scenes/animation";
import { parseManifest } from "../src/schema/manifest";
import { parseScript } from "../src/schema/script";
import { DEFAULT_CAPTION_STYLE, DEFAULT_LOOK, presets } from "../src/theme";

const base = { title: "T", scenes: [{ type: "title", heading: "Hello world", narration: "Hello there, friend." }] };
const audio = [{ audio: "audio/t/0.wav", durationSeconds: 2 }];

describe("style and brand in the script", () => {
  it("accepts a look, a caption style and a handle", () => {
    const r = parseScript({ ...base, style: { look: "aurora", captions: "box" }, brand: { handle: "@devclips" } });
    expect(r.success).toBe(true);
  });

  it("rejects unknown looks and caption styles, and long handles", () => {
    const r = parseScript({
      ...base,
      style: { look: "neon", captions: "karaoke" },
      brand: { handle: "@" + "x".repeat(40) },
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.errors.some((e) => e.startsWith("style.look:"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("style.captions:"))).toBe(true);
    expect(r.errors).toContain("brand.handle: must be at most 32 characters");
  });

  it("fills in the default look and caption style in the manifest", () => {
    const plain = parseScript(base);
    if (!plain.success) throw new Error(plain.errors.join("\n"));
    const m = buildManifest(plain.data, "t", audio);
    expect(m.style).toEqual({ look: DEFAULT_LOOK, captions: DEFAULT_CAPTION_STYLE });
    expect(m.brand).toBeUndefined();

    const styled = parseScript({ ...base, style: { look: "classic" }, brand: { handle: "@devclips" } });
    if (!styled.success) throw new Error(styled.errors.join("\n"));
    const s = buildManifest(styled.data, "t", audio);
    expect(s.style).toEqual({ look: "classic", captions: DEFAULT_CAPTION_STYLE });
    expect(s.brand).toEqual({ handle: "@devclips" });
    expect(parseManifest(s).success).toBe(true);
  });
});

describe("pop captions", () => {
  it("show 2 to 4 words at a time, bigger than box captions", () => {
    const words = distributeWordTimings("one two three four five six seven eight nine ten".split(" "), 0, 100);
    const chunks = chunkWords(words, captionChunkOptions.pop);
    expect(chunks.every((c) => c.words.length >= 2 && c.words.length <= 4)).toBe(true);
    expect(captionFontSize("short", "pop")).toBeGreaterThan(captionFontSize("short", "box"));
  });

  it("leave room for scenes in both presets", () => {
    for (const preset of ["short", "long"] as const) {
      const bottom = captionSafeBottom(preset);
      expect(bottom).toBeGreaterThan(0);
      expect(bottom).toBeLessThan(presets[preset].height / 2);
    }
  });
});

describe("motion", () => {
  it("places particles the same way on every render", () => {
    expect(hash01(3, 1)).toBe(hash01(3, 1));
    for (let i = 0; i < 50; i++) {
      const v = hash01(i, 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("transitions in, holds, then transitions out of a scene", () => {
    const first = sceneTransitionStyle(0, 30, 300);
    const middle = sceneTransitionStyle(150, 30, 300);
    const last = sceneTransitionStyle(299, 30, 300);
    expect(first.opacity).toBe(0);
    expect(middle).toEqual({ opacity: 1, transform: "translateY(0px) scale(1)", filter: undefined });
    expect(last.opacity).toBe(0);
    expect(String(last.filter)).toMatch(/^blur\(/);
  });

  it("staggers heading words and reports when the last one starts", () => {
    const { words, lastStart } = staggeredWords("Server vs Client Components", 0, 30, 5);
    expect(words.map((w) => w.word)).toEqual(["Server", "vs", "Client", "Components"]);
    expect(lastStart).toBe(5 + 3 * 2);
  });
});
