import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranscriptionJson } from "@remotion/install-whisper-cpp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alignToScript,
  AlignmentError,
  captionsToTimedWords,
  createAligner,
  cueProblems,
  findCueWord,
  integerToWords,
  normalizeForMatch,
  resolveCueFrames,
  tokensToWords,
  whisperConfigFromEnv,
  whisperExecutablePath,
  whisperJsonToWords,
  whisperModelPath,
  whisperStatus,
  type HeardWord,
} from "../src/align";
import { splitWords } from "../src/captions";
import { alignScenes, chooseAligner } from "../src/cli/align";
import { buildManifest, sceneTimings } from "../src/cli/manifest";
import { highlightStepStarts, highlightFocus, activeHighlightStep } from "../src/components/timing";
import { codeHighlightStarts } from "../src/scenes/CodeScene";
import { parseScript, type Script } from "../src/schema/script";

const fixture = async (name: string): Promise<TranscriptionJson<true>> =>
  JSON.parse(await readFile(join(__dirname, "fixtures", "whisper", `${name}.json`), "utf8"));

const heard = (...words: [string, number, number][]): HeardWord[] =>
  words.map(([text, startMs, endMs]) => ({ text, startMs, endMs }));

const texts = (captions: { text: string }[]) => captions.map((c) => c.text.trim());

describe("normalizeForMatch", () => {
  it("drops case and punctuation so split identifiers match", () => {
    expect(normalizeForMatch("useEffect,")).toBe("useeffect");
    expect(normalizeForMatch("Array.isArray()")).toBe("arrayisarray");
    expect(normalizeForMatch("NEXT_PUBLIC_API_URL")).toBe("nextpublicapiurl");
    expect(normalizeForMatch("that's")).toBe("thats");
    expect(normalizeForMatch("=>")).toBe("");
  });

  it("spells out numbers and spoken symbols", () => {
    expect(normalizeForMatch("2")).toBe(normalizeForMatch("two"));
    expect(normalizeForMatch("React 19")).toBe("reactnineteen");
    expect(normalizeForMatch("1,000")).toBe("onethousand");
    expect(normalizeForMatch("3.5%")).toBe("threepointfivepercent");
    expect(normalizeForMatch("$5")).toBe("fivedollars");
    expect(normalizeForMatch("10ms")).toBe("tenms");
    expect(normalizeForMatch("café")).toBe("cafe");
  });

  it("reads integers in words", () => {
    expect(integerToWords("0")).toBe("zero");
    expect(integerToWords("42")).toBe("forty two");
    expect(integerToWords("115")).toBe("one hundred fifteen");
    expect(integerToWords("2024")).toBe("two thousand twenty four");
    expect(integerToWords("1000000")).toBe("one million");
  });
});

describe("tokensToWords", () => {
  it("joins tokens without a leading space onto the previous word", () => {
    const words = tokensToWords([
      { text: "Call", startMs: 0, endMs: 300, timestampMs: 10, confidence: 0.9 },
      { text: " use", startMs: 300, endMs: 500, timestampMs: 320, confidence: 0.9 },
      { text: "Effect", startMs: 500, endMs: 800, timestampMs: 520, confidence: 0.7 },
      { text: " [BLANK_AUDIO]", startMs: 800, endMs: 2000, timestampMs: null, confidence: 0.2 },
    ]);
    expect(words).toEqual([
      { text: "Call", startMs: 0, endMs: 300, timestampMs: 10, confidence: 0.9 },
      { text: "useEffect", startMs: 300, endMs: 800, timestampMs: 320, confidence: 0.7 },
    ]);
  });

  it("reads whisper.cpp JSON through Remotion's toCaptions", async () => {
    const words = whisperJsonToWords(await fixture("use-effect"));
    expect(words.map((w) => w.text)).toEqual([
      "Call", "useEffect", "after", "render.", "Array.isArray", "checks", "two",
      "things", "in", "10ms,", "and", "that's", "it!",
    ]);
    expect(words[1]).toMatchObject({ startMs: 380, endMs: 900, timestampMs: 400 });
  });
});

describe("alignToScript", () => {
  it("keeps the script's exact words and takes timing from the audio", async () => {
    const narration = "Call useEffect after render. Array.isArray checks 2 things in 10ms, and that's it!";
    const { captions, matchRatio } = alignToScript(narration, whisperJsonToWords(await fixture("use-effect")));
    expect(texts(captions)).toEqual(splitWords(narration));
    expect(captions[0]!.text).toBe("Call");
    expect(captions[1]!.text).toBe(" useEffect");
    expect(matchRatio).toBeGreaterThan(0.95);
    const at = (word: string) => captions.find((c) => c.text.trim() === word)!;
    expect(at("useEffect")).toMatchObject({ startMs: 380, endMs: 900 });
    // The pause after "render." stays a gap instead of stretching the word.
    expect(at("render.").endMs).toBe(1600);
    expect(at("Array.isArray")).toMatchObject({ startMs: 2100, endMs: 2950 });
    // "2" is heard as "two".
    expect(at("2")).toMatchObject({ startMs: 3300, endMs: 3520, confidence: 0.81 });
    expect(at("10ms,")).toMatchObject({ startMs: 4000, endMs: 4620 });
  });

  it("splits one heard word across several script words and joins several into one", async () => {
    const narration = "Next.js inlines NEXT_PUBLIC_API_URL at build time, so 1,000 users see the same value.";
    const { captions } = alignToScript(narration, whisperJsonToWords(await fixture("next-public")));
    expect(texts(captions)).toEqual(splitWords(narration));
    const at = (word: string) => captions.find((c) => c.text.trim() === word)!;
    // Whisper heard "in lines" and "next public API URL".
    expect(at("inlines")).toMatchObject({ startMs: 640, endMs: 1100 });
    expect(at("NEXT_PUBLIC_API_URL")).toMatchObject({ startMs: 1100, endMs: 2400 });
    // "1,000" was heard as "a thousand", close enough to line up.
    expect(at("1,000").startMs).toBeGreaterThanOrEqual(3560);
    expect(at("1,000").endMs).toBeLessThanOrEqual(4020);
    expect(at("users")).toMatchObject({ startMs: 4020, endMs: 4350 });
  });

  it("splits a joined heard word by letter position", () => {
    const { captions } = alignToScript("use effect", heard(["useEffect", 1000, 1900]));
    expect(captions.map((c) => [c.text, c.startMs, c.endMs])).toEqual([
      ["use", 1000, 1300],
      [" effect", 1300, 1900],
    ]);
  });

  it("times words with nothing spoken between their neighbours", () => {
    const { captions } = alignToScript(
      "map => value",
      heard(["map", 0, 400], ["value", 600, 1000]),
    );
    expect(captions.map((c) => [c.text.trim(), c.startMs, c.endMs])).toEqual([
      ["map", 0, 400],
      ["=>", 400, 600],
      ["value", 600, 1000],
    ]);
  });

  it("survives a word Whisper misspells or drops", () => {
    const { captions } = alignToScript(
      "Zod parses the schema quickly",
      heard(["Sod", 0, 300], ["parses", 300, 700], ["schema", 800, 1200], ["quickly", 1200, 1600]),
    );
    expect(texts(captions)).toEqual(["Zod", "parses", "the", "schema", "quickly"]);
    expect(captions[0]).toMatchObject({ startMs: 0, endMs: 300 });
    expect(captions[2]).toMatchObject({ startMs: 700, endMs: 800 });
  });

  it("fails on an empty or unrelated transcription", () => {
    expect(() => alignToScript("Hello world", [])).toThrow(AlignmentError);
    expect(() =>
      alignToScript("Memoize the expensive calculation", heard(["Thanks", 0, 300], ["for", 300, 400], ["watching", 400, 900])),
    ).toThrow(/does not match the narration/);
  });
});

describe("captionsToTimedWords", () => {
  it("converts milliseconds to frames and keeps every word at least a frame", () => {
    const words = captionsToTimedWords(
      [
        { text: "a", startMs: 0, endMs: 10, timestampMs: null, confidence: null },
        { text: " b", startMs: 5, endMs: 12, timestampMs: null, confidence: null },
        { text: " c", startMs: 1000, endMs: 1500, timestampMs: null, confidence: null },
      ],
      30,
      40,
    );
    expect(words).toEqual([
      { text: "a", startFrame: 0, endFrame: 1 },
      { text: "b", startFrame: 1, endFrame: 2 },
      { text: "c", startFrame: 30, endFrame: 40 },
    ]);
  });

  it("never runs past the audio", () => {
    const words = captionsToTimedWords(
      [
        { text: "a", startMs: 0, endMs: 900, timestampMs: null, confidence: null },
        { text: " b", startMs: 2000, endMs: 2500, timestampMs: null, confidence: null },
      ],
      30,
      30,
    );
    expect(words).toEqual([
      { text: "a", startFrame: 0, endFrame: 27 },
      { text: "b", startFrame: 29, endFrame: 30 },
    ]);
  });
});

describe("createAligner cache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "align-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("transcribes each audio file once, keyed by its contents", async () => {
    const json = await fixture("use-effect");
    const transcriber = vi.fn(async () => json);
    const convert = vi.fn(async (_in: string, out: string) => writeFile(out, "wav"));
    const audio = join(dir, "a.wav");
    await writeFile(audio, "audio bytes");
    const narration = "Call useEffect after render. Array.isArray checks 2 things in 10ms, and that's it!";
    const make = (transcriberId: string) =>
      createAligner({ transcriber, transcriberId, cacheDir: join(dir, "cache"), convert });

    const first = await make("whisper base.en").align(audio, narration);
    const second = await make("whisper base.en").align(audio, narration);
    expect(first.cached).toBe(false);
    expect(second).toEqual({ ...first, cached: true });
    expect(transcriber).toHaveBeenCalledTimes(1);

    // New audio, or another model, transcribes again.
    await writeFile(audio, "other audio bytes");
    await make("whisper base.en").align(audio, narration);
    await make("whisper small.en").align(audio, narration);
    expect(transcriber).toHaveBeenCalledTimes(3);
  });
});

describe("whisper setup detection", () => {
  it("reads config from env with defaults", () => {
    const config = whisperConfigFromEnv({});
    expect(config).toMatchObject({ version: "1.7.6", model: "base.en" });
    expect(config.whisperPath.endsWith("whisper.cpp")).toBe(true);
    expect(() => whisperConfigFromEnv({ WHISPER_MODEL: "huge" })).toThrow(/not a whisper model/);
  });

  it("needs both the binary and the model", () => {
    const config = { whisperPath: "/w", version: "1.7.6", model: "base.en" as const };
    expect(whisperExecutablePath("/w", "1.7.6")).toBe("/w/build/bin/whisper-cli");
    expect(whisperExecutablePath("/w", "1.5.5")).toBe("/w/main");
    expect(whisperModelPath("/w", "base.en")).toBe("/w/ggml-base.en.bin");
    expect(whisperStatus(config, () => false)).toMatchObject({ available: false, reason: expect.stringMatching(/whisper.cpp not found/) });
    expect(whisperStatus(config, (p) => !p.endsWith(".bin"))).toMatchObject({ available: false, reason: expect.stringMatching(/model base.en/) });
    expect(whisperStatus(config, () => true)).toEqual({ available: true });
  });
});

describe("alignment fallback", () => {
  const script = {
    title: "T",
    scenes: [
      { type: "title", heading: "Hi", narration: "Call useEffect after render." },
      { type: "outro", cta: "Bye", narration: "That is all." },
    ],
  } as Script;
  const audio = [
    { narration: script.scenes[0]!.narration, audio: "audio/t/0.wav", durationSeconds: 2 },
    { narration: script.scenes[1]!.narration, audio: "audio/t/1.wav", durationSeconds: 1 },
  ];
  const log = () => {
    const lines: string[] = [];
    return { lines, report: { info: (m: string) => void lines.push(m) } };
  };

  it("is off for --no-align and for silent mock audio", () => {
    expect(chooseAligner(false, "kokoro")).toMatchObject({ aligner: undefined, warn: false });
    expect(chooseAligner(undefined, "mock")).toMatchObject({ aligner: undefined, warn: false });
    expect(chooseAligner(true, "mock")).toMatchObject({ aligner: undefined, warn: true });
  });

  it("warns when whisper.cpp is not installed", () => {
    const choice = chooseAligner(undefined, "kokoro", { env: {}, exists: () => false });
    expect(choice).toMatchObject({ aligner: undefined, warn: true });
    expect(choice.aligner ? "" : choice.reason).toMatch(/estimated timing.*whisper-setup/);
  });

  it("is on when whisper.cpp and the model are installed", () => {
    const choice = chooseAligner(undefined, "kokoro", { env: {}, exists: () => true });
    expect(choice.aligner).toBeDefined();
  });

  it("keeps aligned scenes and estimates the ones that fail, with a warning", async () => {
    const aligner = {
      align: vi.fn(async (_path: string, narration: string) => {
        if (narration.startsWith("That")) throw new AlignmentError("the transcription has no words");
        return { ...alignToScript(narration, heard(["Call", 0, 300], ["useEffect", 300, 900], ["after", 900, 1200], ["render", 1200, 1600])), cached: false };
      }),
    };
    const { lines, report } = log();
    const scenes = await alignScenes(script, audio, { aligner, description: "test" }, "public", report);
    expect(aligner.align).toHaveBeenCalledWith(join("public", "audio/t/0.wav"), "Call useEffect after render.");
    expect(scenes[0]!.words).toHaveLength(4);
    expect(scenes[1]!.words).toBeUndefined();
    expect(lines.filter((l) => l.startsWith("WARNING"))).toEqual([
      "WARNING: scene 2/2 (outro): alignment failed (the transcription has no words); using estimated timing",
      "WARNING: 1 of 2 scenes use estimated caption timing",
    ]);

    const manifest = buildManifest(script, "t", scenes);
    expect(manifest.scenes.map((s) => s.words?.source)).toEqual(["aligned", "estimated"]);
    expect(manifest.scenes[0]!.captions.cues).toEqual([
      { text: "Call", startFrame: 0, endFrame: 9 },
      { text: "useEffect", startFrame: 9, endFrame: 27 },
      { text: "after", startFrame: 27, endFrame: 36 },
      { text: "render.", startFrame: 36, endFrame: 48 },
    ]);
    // Estimated words are stored as Caption objects too.
    expect(manifest.scenes[1]!.words!.captions.map((c) => c.text)).toEqual(["That", " is", " all."]);
  });

  it("prints the reason and drops stale words when alignment cannot run", async () => {
    const { lines, report } = log();
    const withWords = audio.map((a) => ({ ...a, words: [] }));
    const scenes = await alignScenes(script, withWords, { aligner: undefined, reason: "nope", warn: true }, "public", report);
    expect(scenes.every((s) => s.words === undefined)).toBe(true);
    expect(lines).toEqual(["WARNING: nope"]);
  });

  it("estimates when stored words do not match the narration", () => {
    const words = alignToScript("Hello there", heard(["Hello", 0, 300], ["there", 300, 600])).captions;
    expect(sceneTimings("Hello there", 30, 30, words).words.source).toBe("aligned");
    expect(sceneTimings("Hello there friend", 30, 30, words).words.source).toBe("estimated");
  });
});

describe("highlight cues", () => {
  const words = splitWords("First the length, then the string, then the length again.").map((text, i) => ({
    text,
    startFrame: i * 10,
    endFrame: i * 10 + 10,
  }));

  it("finds cue words ignoring case and punctuation, in narration order", () => {
    const list = words.map((w) => w.text);
    expect(findCueWord(list, "length")).toBe(2);
    expect(findCueWord(list, "Length", 3)).toBe(8);
    expect(findCueWord(list, "the string")).toBe(4);
    expect(findCueWord(list, "missing")).toBe(-1);
    expect(findCueWord(["Call", "Array.isArray()"], "isArray")).toBe(-1);
    expect(findCueWord(["Call", "Array.isArray()"], "Array.isArray")).toBe(1);
  });

  it("resolves a repeated cue word to the occurrence after the previous cue", () => {
    expect(resolveCueFrames([{ cue: "length" }, {}, { cue: "length" }], words)).toEqual([20, undefined, 80]);
  });

  it("starts cued steps on their word and spaces the others evenly", () => {
    expect(highlightStepStarts(90, 3)).toEqual([0, 30, 60]);
    expect(highlightStepStarts(100, 3, [undefined, 70])).toEqual([0, 70, 85]);
    expect(highlightStepStarts(100, 3, [40])).toEqual([40, 60, 80]);
    expect(highlightStepStarts(100, 4, [10, undefined, undefined, 70])).toEqual([10, 30, 50, 70]);
    // Out-of-order or out-of-range cues are clamped.
    expect(highlightStepStarts(100, 2, [50, 20])).toEqual([50, 50]);
    expect(highlightStepStarts(100, 1, [-5])).toEqual([0]);
  });

  it("shows no highlight before the first cue and the step after it", () => {
    const starts = highlightStepStarts(100, 2, [40, 70]);
    const ranges = [{ from: 1, to: 1 }, { from: 3, to: 3 }];
    expect(highlightFocus(39, 100, ranges, 6, 12, starts)).toMatchObject({ step: 0, strength: 0, top: 0, bottom: 6 });
    expect(highlightFocus(52, 100, ranges, 6, 12, starts)).toMatchObject({ step: 0, strength: 1, top: 0, bottom: 1 });
    expect(activeHighlightStep(69, 100, 2, starts)).toBe(0);
    expect(activeHighlightStep(70, 100, 2, starts)).toBe(1);
  });

  it("offsets cue frames by where the highlight overlay starts", () => {
    const steps = [{ from: 1, to: 1, cue: "length" }, { from: 2, to: 2 }];
    expect(codeHighlightStarts(steps, 100, 0, words)).toEqual([20, 60]);
    // With typing, a cue before the code is typed waits for it.
    expect(codeHighlightStarts(steps, 100, 30, words)).toEqual([0, 35]);
    // Without word timings, cued steps fall back to even spacing.
    expect(codeHighlightStarts(steps, 100, 0)).toEqual([0, 50]);
  });

  it("validates cues against the narration", () => {
    expect(cueProblems("Read the length, then the string.", [{ cue: "string" }, { cue: "length" }])).toEqual([
      { step: 1, message: 'cue "length" is not spoken after the previous step\'s cue; cues must follow the narration order' },
    ]);
    const result = parseScript({
      title: "T",
      scenes: [
        {
          type: "code",
          language: "typescript",
          code: "a\nb",
          narration: "First a, then b.",
          highlight: [{ from: 1, to: 1, cue: "a" }, { from: 2, to: 2, cue: "c" }],
        },
      ],
    });
    expect(result.success ? [] : result.errors).toContain(
      'scenes[0].highlight[1].cue: cue "c" is not a word in this scene\'s narration',
    );
  });
});
