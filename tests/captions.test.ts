import { describe, expect, it } from "vitest";
import {
  activeChunkAt,
  activeWordIndexAt,
  captionScene,
  chunkWords,
  chunksFromManifestCaptions,
  distributeWordTimings,
  formatSrt,
  formatSrtTimestamp,
  sanitizeCaptionText,
  splitWords,
  toVideoTimeline,
  videoToSrt,
  wordsToCues,
  type TimedWord,
} from "../src/captions";

/** One frame per word, back to back. */
const timed = (text: string): TimedWord[] =>
  text.split(" ").map((t, i) => ({ text: t, startFrame: i, endFrame: i + 1 }));

const sizes = (text: string) => chunkWords(timed(text)).map((c) => c.words.length);

describe("sanitizeCaptionText", () => {
  it("replaces em dashes with commas", () => {
    expect(sanitizeCaptionText("Memo it — once")).toBe("Memo it, once");
    expect(sanitizeCaptionText("fast—really fast")).toBe("fast, really fast");
    expect(sanitizeCaptionText("wait, — no")).toBe("wait, no");
    expect(sanitizeCaptionText("the end \u2014.")).toBe("the end.");
    expect(sanitizeCaptionText("— leading and trailing —")).toBe(
      "leading and trailing",
    );
  });

  it("collapses whitespace", () => {
    expect(splitWords("  one\n two\tthree ")).toEqual(["one", "two", "three"]);
    expect(splitWords("   ")).toEqual([]);
  });
});

describe("distributeWordTimings", () => {
  it("splits time in proportion to word length", () => {
    // weights 1, 3, 6 over 10 frames with one frame reserved per word
    expect(distributeWordTimings(["a", "abc", "abcdef"], 0, 10)).toEqual([
      { text: "a", startFrame: 0, endFrame: 1 + 1 },
      { text: "abc", startFrame: 2, endFrame: 2 + 3 },
      { text: "abcdef", startFrame: 5, endFrame: 10 },
    ]);
  });

  it("ignores punctuation when weighing words", () => {
    const [a, b] = distributeWordTimings(["hi,", "yo"], 0, 20);
    expect(a!.endFrame - a!.startFrame).toBe(b!.endFrame - b!.startFrame);
  });

  it("is contiguous, covers the span exactly, and never gives a word zero frames", () => {
    const words = splitWords("a extraordinarily b c defenestration d e f g");
    const out = distributeWordTimings(words, 30, 50);
    expect(out[0]!.startFrame).toBe(30);
    expect(out[out.length - 1]!.endFrame).toBe(50);
    out.forEach((w, i) => {
      expect(w.endFrame).toBeGreaterThan(w.startFrame);
      if (i > 0) expect(w.startFrame).toBe(out[i - 1]!.endFrame);
    });
  });

  it("handles empty input", () => {
    expect(distributeWordTimings([], 0, 100)).toEqual([]);
  });
});

describe("chunkWords", () => {
  it("keeps chunks between 3 and 6 words", () => {
    const text = Array.from({ length: 23 }, (_, i) => `w${i}`).join(" ");
    const out = sizes(text);
    expect(out.reduce((a, b) => a + b, 0)).toBe(23);
    out.forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    });
  });

  it("breaks at punctuation once a chunk has 3 words", () => {
    expect(sizes("one two three. four five six seven eight nine ten")).toEqual([3, 4, 3]);
    expect(sizes("one two, three four five six seven")).toEqual([4, 3]);
  });

  it("does not break at punctuation if it would leave a short tail", () => {
    expect(sizes("one two three. four five")).toEqual([5]);
  });

  it("rebalances a short tail that cannot merge", () => {
    expect(sizes("a b c d e f g")).toEqual([4, 3]);
    expect(sizes("a b c d e f g h")).toEqual([4, 4]);
  });

  it("returns one short chunk when there are fewer than 3 words", () => {
    expect(sizes("Hello world.")).toEqual([2]);
    expect(chunkWords([])).toEqual([]);
  });

  it("derives chunk text and frames from its words", () => {
    const [chunk] = chunkWords(timed("a b c"));
    expect(chunk).toMatchObject({ text: "a b c", startFrame: 0, endFrame: 3 });
  });

  it("rejects chunk sizes it cannot satisfy", () => {
    expect(() => chunkWords([], { minWords: 4, maxWords: 5 })).toThrow(/invalid chunk sizes/);
  });
});

describe("captionScene", () => {
  it("estimates timings across the audio when no words are given", () => {
    const chunks = captionScene({
      narration: "useMemo caches a value — until a dependency changes.",
      audioDurationInFrames: 90,
    });
    expect(chunks.map((c) => c.text)).toEqual([
      "useMemo caches a value,",
      "until a dependency changes.",
    ]);
    expect(chunks[0]!.startFrame).toBe(0);
    expect(chunks[1]!.startFrame).toBe(chunks[0]!.endFrame);
    expect(chunks[1]!.endFrame).toBe(90);
  });

  it("uses word-level timings when given", () => {
    const words: TimedWord[] = [
      { text: "one", startFrame: 5, endFrame: 10 },
      { text: "two", startFrame: 12, endFrame: 20 },
      { text: "—", startFrame: 20, endFrame: 21 },
      { text: "three", startFrame: 25, endFrame: 40 },
    ];
    const [chunk] = captionScene({ narration: "ignored", audioDurationInFrames: 60, words });
    expect(chunk).toMatchObject({ text: "one two three", startFrame: 5, endFrame: 40 });
  });

  it("round-trips through manifest word cues", () => {
    const words = distributeWordTimings(splitWords("a b c d e f g"), 0, 70);
    const cues = wordsToCues(words);
    expect(chunksFromManifestCaptions({ granularity: "word", cues })).toEqual(
      chunkWords(words),
    );
  });

  it("estimates words inside sentence cues", () => {
    const chunks = chunksFromManifestCaptions({
      granularity: "sentence",
      cues: [{ text: "First one here.", startFrame: 10, endFrame: 40 }],
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ startFrame: 10, endFrame: 40 });
    expect(chunks[0]!.words).toHaveLength(3);
  });
});

describe("active chunk and word", () => {
  const chunks = chunkWords(timed("a b c d e f"), { minWords: 1, maxWords: 3 });

  it("finds the chunk and word at a frame", () => {
    expect(activeChunkAt(chunks, 4)?.text).toBe("d e f");
    expect(activeWordIndexAt(chunks[1]!.words, 4)).toBe(1);
    expect(activeChunkAt(chunks, 6)).toBeUndefined();
  });
});

describe("SRT", () => {
  it("formats timestamps", () => {
    expect(formatSrtTimestamp(0, 30)).toBe("00:00:00,000");
    expect(formatSrtTimestamp(1, 30)).toBe("00:00:00,033");
    expect(formatSrtTimestamp(45, 30)).toBe("00:00:01,500");
    expect(formatSrtTimestamp(30 * 3723 + 15, 30)).toBe("01:02:03,500");
  });

  it("formats numbered cues separated by blank lines", () => {
    const chunks = chunkWords(timed("a b c d e f"), { minWords: 1, maxWords: 3 });
    expect(formatSrt(chunks, 30)).toBe(
      "1\n00:00:00,000 --> 00:00:00,100\na b c\n\n" +
        "2\n00:00:00,100 --> 00:00:00,200\nd e f\n",
    );
  });

  it("offsets each scene by the full length of the scenes before it", () => {
    const scene = (text: string, start: number, end: number) =>
      chunkWords(distributeWordTimings(splitWords(text), start, end));
    const scenes = [
      { durationInFrames: 75, chunks: scene("Hello there friends.", 0, 60) },
      { durationInFrames: 60, chunks: scene("Second scene here.", 0, 45) },
    ];
    expect(toVideoTimeline(scenes)[1]!.words[0]!.startFrame).toBe(75);
    expect(videoToSrt(scenes, 30)).toBe(
      "1\n00:00:00,000 --> 00:00:02,000\nHello there friends.\n\n" +
        "2\n00:00:02,500 --> 00:00:04,000\nSecond scene here.\n",
    );
  });
});
