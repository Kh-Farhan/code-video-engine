import { describe, expect, it } from "vitest";
import {
  activePageAt,
  activeTokenIndexAt,
  captionPages,
  captionsToWords,
  fitPageFontSize,
  sceneCaptions,
  wordsToCaptions,
  type Caption,
  type TimedWord,
} from "../src/captions";
import {
  captionBand,
  CAPTION_MAX_LINES,
  POP_FONT_SIZE,
  POP_WORD_MAX_SCALE,
  POP_MIN_FONT_SIZE,
  visualZone,
  visualZoneRect,
} from "../src/captions/layout";
import { platformSafeArea, presetNames, presets } from "../src/theme";

const FPS = 30;

/** Words of `frames` frames each, back to back. */
const timed = (text: string, frames = 12): TimedWord[] =>
  text.split(" ").map((t, i) => ({ text: t, startFrame: i * frames, endFrame: (i + 1) * frames }));

const caps = (text: string, frames?: number): Caption[] => wordsToCaptions(timed(text, frames), FPS);

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("wordsToCaptions", () => {
  it("converts frames to ms in the @remotion/captions Caption shape", () => {
    const [a, b] = wordsToCaptions(timed("hello world", 15), FPS);
    expect(a).toEqual({ text: "hello", startMs: 0, endMs: 500, timestampMs: 250, confidence: null });
    // Leading space marks a word boundary for createTikTokStyleCaptions.
    expect(b).toMatchObject({ text: " world", startMs: 500, endMs: 1000 });
  });

  it("forces a page break after a sentence ends", () => {
    const out = caps("Done. Next");
    expect(out[0]!.pageBreakAfter).toBe(true);
    expect(out[1]!.pageBreakAfter).toBeUndefined();
  });

  it("round trips through captionsToWords", () => {
    const w = timed("one two three");
    expect(captionsToWords(wordsToCaptions(w, FPS), FPS)).toEqual(w);
  });
});

describe("captionPages", () => {
  it("shows 1 to 3 words per page, every word once and in order", () => {
    for (const frames of [3, 8, 12, 30]) {
      const pages = captionPages(caps(words(23), frames));
      pages.forEach((p) => {
        expect(p.tokens.length).toBeGreaterThanOrEqual(1);
        expect(p.tokens.length).toBeLessThanOrEqual(3);
      });
      const all = pages.flatMap((p) => p.tokens.map((t) => t.text.trim()));
      expect(all).toEqual(words(23).split(" "));
    }
  });

  it("groups by time with createTikTokStyleCaptions: slow words get their own page", () => {
    // 1 second per word is longer than the 800 ms combine window.
    expect(captionPages(caps(words(4), 30)).map((p) => p.tokens.length)).toEqual([1, 1, 1, 1]);
  });

  it("splits fast speech into even pages of at most 3 words", () => {
    // 2 frames per word: the whole run fits in one combine window.
    expect(captionPages(caps(words(7), 2)).map((p) => p.tokens.length)).toEqual([3, 2, 2]);
    expect(captionPages(caps(words(4), 2)).map((p) => p.tokens.length)).toEqual([2, 2]);
  });

  it("never runs a page across a sentence end", () => {
    const pages = captionPages(caps("It works. Ship it now", 4));
    expect(pages.map((p) => p.text)).toEqual(["It works.", "Ship it now"]);
  });

  it("changes pages only when a word starts, with no gaps between pages", () => {
    const c = caps(words(11), 7);
    const starts = new Set(c.map((x) => x.startMs));
    const pages = captionPages(c);
    pages.forEach((p, i) => {
      expect(starts.has(p.startMs)).toBe(true);
      expect(p.startMs).toBe(p.tokens[0]!.fromMs);
      const next = pages[i + 1];
      if (next) expect(p.startMs + p.durationMs).toBe(next.startMs);
    });
    const last = pages[pages.length - 1]!;
    expect(last.startMs + last.durationMs).toBe(c[c.length - 1]!.endMs);
  });

  it("returns no pages for no captions", () => {
    expect(captionPages([])).toEqual([]);
  });
});

describe("active page and word", () => {
  const pages = captionPages(caps("alpha beta gamma delta", 2));
  const [first, second] = pages as [(typeof pages)[0], (typeof pages)[0]];
  const ms = (frame: number) => (frame * 1000) / FPS;

  it("finds the page on screen", () => {
    expect(activePageAt(pages, 0)).toBe(first);
    expect(activePageAt(pages, ms(3.9))).toBe(first);
    expect(activePageAt(pages, ms(4))).toBe(second);
    expect(activePageAt(pages, ms(8))).toBeUndefined();
    expect(activePageAt(pages, -1)).toBeUndefined();
  });

  it("highlights the word being spoken", () => {
    expect(activeTokenIndexAt(first, ms(0))).toBe(0);
    expect(activeTokenIndexAt(first, ms(1.9))).toBe(0);
    expect(activeTokenIndexAt(first, ms(2))).toBe(1);
    expect(activeTokenIndexAt(second, ms(7))).toBe(1);
  });

  it("keeps the last word active through a pause, and none before the first starts", () => {
    const page = { text: "a b", startMs: 0, durationMs: 2000, tokens: [
      { text: "a", fromMs: 100, toMs: 300 },
      { text: " b", fromMs: 900, toMs: 1200 },
    ] };
    expect(activeTokenIndexAt(page, 50)).toBe(-1);
    expect(activeTokenIndexAt(page, 600)).toBe(0);
    expect(activeTokenIndexAt(page, 1500)).toBe(1);
  });
});

describe("sceneCaptions", () => {
  it("uses word cues as they are", () => {
    const cues = timed("Hello there friend.", 10);
    const out = sceneCaptions({ captions: { granularity: "word", cues } }, FPS);
    expect(out.map((c) => c.text)).toEqual(["Hello", " there", " friend."]);
    expect(out[1]).toMatchObject({ startMs: (10 * 1000) / FPS, endMs: (20 * 1000) / FPS });
  });

  it("falls back to estimated word timings for sentence cues", () => {
    const out = sceneCaptions(
      { captions: { granularity: "sentence", cues: [{ text: "Memo it — once. Then stop", startFrame: 30, endFrame: 90 }] } },
      FPS,
    );
    expect(out.map((c) => c.text.trim())).toEqual(["Memo", "it,", "once.", "Then", "stop"]);
    expect(out[0]!.startMs).toBe(1000);
    expect(out[out.length - 1]!.endMs).toBe(3000);
    out.forEach((c, i) => {
      expect(c.endMs).toBeGreaterThan(c.startMs);
      if (i > 0) expect(c.startMs).toBe(out[i - 1]!.endMs);
    });
    expect(captionPages(out).map((p) => p.text)).toEqual(["Memo it, once.", "Then stop"]);
  });
});

describe("sceneCaptions with manifest word captions", () => {
  it("prefers the manifest's Captions over the cues and adds sentence page breaks", () => {
    const words = {
      source: "aligned" as const,
      captions: [
        { text: "Ship", startMs: 0, endMs: 300, timestampMs: null, confidence: 0.9 },
        { text: " it.", startMs: 300, endMs: 600, timestampMs: null, confidence: 0.9 },
        { text: " Now", startMs: 900, endMs: 1200, timestampMs: null, confidence: 0.8 },
      ],
    };
    const cues = timed("ignored cue words", 10);
    const out = sceneCaptions({ captions: { granularity: "word", cues }, words }, FPS);
    expect(out.map((c) => c.text)).toEqual(["Ship", " it.", " Now"]);
    expect(out[1]!.pageBreakAfter).toBe(true);
    expect(out[2]).toMatchObject({ startMs: 900, confidence: 0.8 });
    expect(captionPages(out).map((p) => p.text)).toEqual(["Ship it.", "Now"]);
  });
});

describe("pop font fitting", () => {
  const band = captionBand("short");
  const fit = (w: string[]) =>
    fitPageFontSize(w, {
      max: POP_FONT_SIZE.short,
      min: POP_MIN_FONT_SIZE.short,
      maxWidth: band.width,
      maxLines: CAPTION_MAX_LINES.short,
    });

  it("keeps short words at full size", () => {
    expect(fit(["use", "a", "memo"])).toBe(POP_FONT_SIZE.short);
  });

  it("shrinks a very long word so it fits, but not below the minimum", () => {
    const size = fit(["createTikTokStyleCaptions"]);
    expect(size).toBeLessThan(POP_FONT_SIZE.short);
    expect(size).toBeGreaterThanOrEqual(POP_MIN_FONT_SIZE.short);
    expect(fit(["x".repeat(200)])).toBe(POP_MIN_FONT_SIZE.short);
  });
});

describe("frame layout", () => {
  it("keeps the caption band below the visual zone with no overlap", () => {
    for (const preset of presetNames) {
      const zone = visualZoneRect(preset);
      const band = captionBand(preset);
      expect(zone.top + zone.height).toBeLessThan(band.top);
      expect(zone.height).toBeGreaterThan(presets[preset].height / 3);
    }
  });

  it("keeps captions and visuals inside the short platform safe area", () => {
    const { width, height } = presets.short;
    const safe = platformSafeArea.short;
    const band = captionBand("short");
    const zone = visualZone("short");
    expect(band.top + band.height).toBeLessThanOrEqual(height - safe.bottom);
    expect(band.left).toBeGreaterThanOrEqual(safe.left);
    expect(band.left + band.width).toBeLessThanOrEqual(width - safe.right);
    expect(zone.top).toBeGreaterThanOrEqual(safe.top);
    expect(zone.right).toBeGreaterThanOrEqual(safe.right);
    expect(zone.left).toBeGreaterThanOrEqual(safe.left);
  });

  it("moves the band when the safe area changes", () => {
    const bigger = { ...platformSafeArea.short, bottom: 600 };
    expect(captionBand("short", bigger).top).toBe(captionBand("short").top - 120);
  });

  it("puts long captions in the lower third", () => {
    const { height } = presets.long;
    const band = captionBand("long");
    expect(band.top).toBeGreaterThanOrEqual((height * 2) / 3);
    expect(band.top + band.height).toBeLessThanOrEqual(height);
  });

  it("fits two lines of the biggest pop caption in the band", () => {
    for (const preset of presetNames) {
      expect(captionBand(preset).height).toBeGreaterThanOrEqual(
        CAPTION_MAX_LINES[preset] * POP_FONT_SIZE[preset] * 1.1 * POP_WORD_MAX_SCALE,
      );
    }
  });
});
