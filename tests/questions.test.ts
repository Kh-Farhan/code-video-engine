import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sanitizeCaptionText, splitWords } from "../src/captions/text";
import { continuousSceneWords, countQuestionMarks, resolveQuestionChunks, voiceContinuous } from "../src/cli/narration";
import { LINT_MAX_QUESTION_WORDS, lintNarration } from "../src/cli/narrationLint";
import { pipelinePaths } from "../src/cli/paths";
import { resolveProvider, runVoice } from "../src/cli/voice";
import { parseVoices, runVoiceTest, sentenceSlug, voiceTestFileName } from "../src/cli/voiceTest";
import { splitAtPauseMarkers, stripPauseMarkers } from "../src/schema/pauses";
import { parseScript, type Script } from "../src/schema/script";
import {
  chunkAtSentences,
  createTtsProvider,
  defaultPauses,
  endsQuestion,
  ensureSentenceEnd,
  joinNarration,
  narrationBreaks,
  planChunks,
  spokenSentences,
  splitSentences,
  withTtsDebug,
  type TtsProvider,
} from "../src/tts";

const silent = { info: () => {} };

const QUESTIONS = ["So, does it log one, or three?", "What does this log?", "Guess the output. Ready?"];

const script = (narrations: string[], style?: Script["style"]): Script => {
  const parsed = parseScript({
    title: "Questions",
    ...(style ? { style } : {}),
    scenes: narrations.map((narration, i) =>
      i === 0 ? { type: "title", heading: "Questions", narration } : { type: "text", text: "On screen", narration },
    ),
  });
  if (!parsed.success) throw new Error(parsed.errors.join("\n"));
  return parsed.data;
};

/** Mock audio, recording the exact text of every request. */
const recording = (cacheDir: string, overrides: Partial<TtsProvider> = {}) => {
  const mock = createTtsProvider("mock", { cacheDir });
  const requests: { text: string; voice?: string }[] = [];
  const provider: TtsProvider = {
    ...mock,
    synthesize: (text, o) => {
      requests.push({ text, ...(o?.voiceId ? { voice: o.voiceId } : {}) });
      return mock.synthesize(text, o);
    },
    ...overrides,
  };
  return { provider, requests };
};

describe("a question stays a question through the text pipeline", () => {
  const cases = [
    "So, does it log one, or three?",
    "Guess the output. Ready? [pause] It logs three.",
    "Ready [pause]?",
    "Ready? [pause:500] Go.",
    "Is it — really?",
    'Is it "use client"?',
    "Does it run (twice?)",
  ];

  it.each(cases)("keeps every ? in %j", (text) => {
    const q = countQuestionMarks(text);
    expect(countQuestionMarks(stripPauseMarkers(text))).toBe(q);
    expect(countQuestionMarks(sanitizeCaptionText(text))).toBe(q);
    expect(countQuestionMarks(splitWords(text).join(" "))).toBe(q);
    expect(countQuestionMarks(splitAtPauseMarkers(text).map((p) => p.text).join(" "))).toBe(q);
    const clean = stripPauseMarkers(text);
    expect(countQuestionMarks(ensureSentenceEnd(clean))).toBe(q);
    expect(countQuestionMarks(joinNarration([clean, clean]))).toBe(2 * q);
    expect(countQuestionMarks(splitSentences(clean).join(" "))).toBe(q);
    expect(countQuestionMarks(chunkAtSentences(clean, 12).join(" "))).toBe(q);
    expect(countQuestionMarks(spokenSentences(clean).join(" "))).toBe(q);
    const b = narrationBreaks([text, text]);
    expect(countQuestionMarks(b.spoken.join(" "))).toBe(2 * q);
    for (const opts of [{}, { questionChunks: true }]) {
      for (const max of [undefined, 10]) {
        expect(countQuestionMarks(planChunks(b, max, opts).map((c) => c.text).join(" "))).toBe(2 * q);
      }
    }
  });

  it("never turns a ? into a period at a scene end", () => {
    expect(ensureSentenceEnd("Ready?")).toBe("Ready?");
    expect(ensureSentenceEnd('Ready?"')).toBe('Ready?"');
    expect(narrationBreaks(["What does this log?", "Three"]).spoken).toEqual(["What", "does", "this", "log?", "Three."]);
  });

  it("splits Kokoro's sentences itself, so a stray apostrophe cannot glue questions to statements", () => {
    // kokoro-js's own splitter returns this as one sentence: it waits for the apostrophe to close.
    expect(spokenSentences("The users' data is gone. What does this log? It logs three.")).toEqual([
      "The users' data is gone.",
      "What does this log?",
      "It logs three.",
    ]);
    expect(spokenSentences("Use a map, e.g. new Map. Ready?")).toEqual(["Use a map, e.g. new Map.", "Ready?"]);
    expect(endsQuestion("three?")).toBe(true);
    expect(endsQuestion('"ready?"')).toBe(true);
    expect(endsQuestion("(why?)")).toBe(true);
    expect(endsQuestion("three.")).toBe(false);
  });
});

describe("question chunks", () => {
  it("sends every question as its own chunk ending in ?, joined with the sentence pause", () => {
    const b = narrationBreaks(["Guess the output. Ready? It logs three.", "So, does it log one, or three?"]);
    const chunks = planChunks(b, undefined, { questionChunks: true });
    expect(chunks.map((c) => [c.text, !!c.question])).toEqual([
      ["Guess the output.", false],
      ["Ready?", true],
      ["It logs three.", false],
      ["So, does it log one, or three?", true],
    ]);
    // The pause owed at each join is the normal sentence (or scene) pause.
    expect(chunks.slice(0, -1).map((c) => b.breaks[c.to - 1])).toEqual([
      { kind: "sentence", minMs: defaultPauses.sentenceMs },
      { kind: "sentence", minMs: defaultPauses.sentenceMs },
      { kind: "scene", minMs: defaultPauses.sceneMs },
    ]);
  });

  it("is off by default in planChunks and leaves statements together", () => {
    const b = narrationBreaks(["Guess the output. Ready? It logs three. Then it stops."]);
    expect(planChunks(b).map((c) => c.text)).toEqual(["Guess the output. Ready? It logs three. Then it stops."]);
    expect(planChunks(b, undefined, { questionChunks: true }).map((c) => c.text)).toEqual([
      "Guess the output.",
      "Ready?",
      "It logs three. Then it stops.",
    ]);
  });

  it("works together with pause markers and length limits", () => {
    const b = narrationBreaks(["One. Two. Ready? [pause:500] Three. Four."]);
    const chunks = planChunks(b, 6, { questionChunks: true });
    expect(chunks.map((c) => c.text)).toEqual(["One.", "Two.", "Ready?", "Three.", "Four."]);
    expect(b.breaks[chunks[2]!.to - 1]).toEqual({ kind: "sentence", markerMs: 500, minMs: 500 });
  });

  it("is on by default, can be turned off by style or flag, and only for isolated-request providers", () => {
    const kokoroLike = { questionChunks: true };
    expect(resolveQuestionChunks({}, kokoroLike)).toBe(true);
    expect(resolveQuestionChunks({ style: { questionChunks: false } }, kokoroLike)).toBe(false);
    expect(resolveQuestionChunks({ style: { questionChunks: false } }, kokoroLike, true)).toBe(true);
    expect(resolveQuestionChunks({}, kokoroLike, false)).toBe(false);
    expect(resolveQuestionChunks({}, {})).toBe(false);
    expect(createTtsProvider("kokoro").questionChunks).toBe(true);
    expect(createTtsProvider("gemini").questionChunks).toBeUndefined();
    expect(createTtsProvider("elevenlabs").questionChunks).toBeUndefined();
  });
});

describe("voicing questions", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "questions-"));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const pathsFor = (name: string) =>
    pipelinePaths("questions", { publicDir: join(root, name, "public"), outRoot: join(root, name, "out") });

  const narrations = ["Guess the output. Ready?", "It logs three. So, does it log one, or three?"];

  it("sends the exact text with every ? to the provider, one question per request", async () => {
    const paths = pathsFor("on");
    const { provider, requests } = recording(paths.audioDir);
    const track = await voiceContinuous(script(narrations), provider, silent, paths);
    expect(requests.map((r) => r.text)).toEqual([
      "Guess the output.",
      "Ready?",
      "It logs three.",
      "So, does it log one, or three?",
    ]);
    const words = continuousSceneWords(narrations, track).flatMap((s) => s.words);
    expect(words.map((w) => w.text.trim())).toEqual(narrations.flatMap(splitWords));
    const gapAfter = (word: string) => {
      const i = words.findIndex((w) => w.text.trim() === word);
      return words[i + 1]!.startMs - words[i]!.endMs;
    };
    expect(gapAfter("output.")).toBeGreaterThanOrEqual(defaultPauses.sentenceMs - 1);
    expect(gapAfter("Ready?")).toBeGreaterThanOrEqual(defaultPauses.sceneMs - 1);
    expect(gapAfter("three.")).toBeGreaterThanOrEqual(defaultPauses.sentenceMs - 1);
  });

  it("keeps questions inside the text with style.questionChunks false", async () => {
    const paths = pathsFor("off");
    const { provider, requests } = recording(paths.audioDir);
    await voiceContinuous(script(narrations, { questionChunks: false }), provider, silent, paths);
    expect(requests.map((r) => r.text)).toEqual([
      "Guess the output. Ready? It logs three. So, does it log one, or three?",
    ]);
  });

  it("logs the chunk plan and the exact request text with --debug-tts", async () => {
    const paths = pathsFor("debug");
    const lines: string[] = [];
    const { provider } = recording(paths.audioDir);
    await voiceContinuous(script(narrations), withTtsDebug(provider, (m) => lines.push(m)), silent, paths, undefined, 1, undefined, {
      debug: (m) => lines.push(m),
    });
    expect(lines[0]).toBe("question marks: 2 in the script, 2 in the text sent to mock; questionChunks on");
    expect(lines).toContain('chunk 2/4 (question): "Ready?", then 350ms scene pause');
    expect(lines).toContain('tts request 2 -> mock (voice mock, speed 1): "Ready?"');
    expect(lines).toContain('tts request 4 -> mock (voice mock, speed 1): "So, does it log one, or three?"');
  });
});

describe("style.ttsProvider", () => {
  it("is validated by the schema", () => {
    expect(parseScript({ title: "T", style: { ttsProvider: "gemini" }, scenes: [{ type: "title", heading: "H", narration: "Hi?" }] }).success).toBe(true);
    const bad = parseScript({ title: "T", style: { ttsProvider: "siri" }, scenes: [{ type: "title", heading: "H", narration: "Hi?" }] });
    expect(bad.success).toBe(false);
  });

  it("overrides --provider, except mock, which always wins", () => {
    const gemini = { style: { ttsProvider: "gemini" as const } };
    expect(resolveProvider(gemini, "kokoro")).toEqual({ name: "gemini", from: "script" });
    expect(resolveProvider(gemini)).toEqual({ name: "gemini", from: "script" });
    expect(resolveProvider(gemini, "mock")).toEqual({ name: "mock", from: "flag" });
    expect(resolveProvider({}, "kokoro")).toEqual({ name: "kokoro", from: "flag" });
    expect(resolveProvider({})).toEqual({ name: "mock", from: "default" });
  });

  it("voices the whole video with one provider and one voice", async () => {
    const root = await mkdtemp(join(tmpdir(), "questions-provider-"));
    try {
      const paths = pipelinePaths("q", { publicDir: join(root, "public"), outRoot: join(root, "out") });
      const made: string[] = [];
      const { provider, requests } = recording(paths.audioDir);
      const s = script(["What does this log?", "It logs three. Ready?"], { ttsProvider: "gemini" });
      s.voice = { gemini: "Puck", kokoro: "am_puck" };
      const lines: string[] = [];
      const index = await runVoice(s, "q", "kokoro", paths, { info: (m) => lines.push(m) }, undefined, undefined, {
        mode: false,
        makeProvider: (name) => {
          made.push(name);
          // Gemini voices with context, so it gets no question chunks.
          return { ...provider, name: name as TtsProvider["name"], defaultVoiceId: "Kore", questionChunks: undefined };
        },
      });
      expect(made).toEqual(["gemini"]);
      expect(index.provider).toBe("gemini");
      expect(index.voice).toBe("Puck");
      expect(new Set(requests.map((r) => r.voice))).toEqual(new Set(["Puck"]));
      expect(requests.map((r) => r.text)).toEqual(["What does this log? It logs three. Ready?"]);
      expect(lines).toContain("provider: gemini (style.ttsProvider, overrides --provider kokoro), voice: Puck");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("question linter", () => {
  it("flags questions over 10 words and suggests a short yes/no or either/or phrasing", () => {
    const [w, ...rest] = lintNarration("So what does this code log to the console when it runs?", 2, "code");
    expect(rest).toEqual([]);
    expect(w!.rule).toBe("long-question");
    expect(w!.message).toContain("scene 3 (code): 12-word question");
    expect(w!.suggestion).toContain('"So what does this code log to the console?" becomes "So, does it log one, or three?"');
  });

  it(`accepts questions of ${LINT_MAX_QUESTION_WORDS} words or fewer, and long statements`, () => {
    expect(lintNarration("So, does it log one, or three?")).toEqual([]);
    expect(lintNarration("So what does this code log to the console?")).toEqual([]);
    expect(lintNarration("One two three four five six seven eight nine ten?")).toEqual([]);
    expect(lintNarration("One two three four five six seven eight nine ten, eleven.")).toEqual([]);
    expect(lintNarration("One two three four five six seven eight nine ten, eleven?").map((w) => w.rule)).toEqual(["long-question"]);
  });

  it("warns when a pause marker splits a question", () => {
    expect(lintNarration("So, does it log [pause] one, or three?").map((w) => w.rule)).toEqual(["split-question"]);
    expect(lintNarration("Ready? [pause] Go.")).toEqual([]);
  });
});

describe("voice-test", () => {
  let out: string;
  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), "voice-test-"));
  });
  afterAll(async () => {
    await rm(out, { recursive: true, force: true });
  });

  it("names files by sentence, voice and speed", () => {
    expect(sentenceSlug("So, does it log one, or three?")).toBe("so-does-it-log-one-or-three-q");
    expect(sentenceSlug("So, does it log one, or three.")).toBe("so-does-it-log-one-or-three");
    expect(sentenceSlug("...")).toBe("sentence");
    expect(parseVoices("am_puck, am_michael,,af_heart")).toEqual(["am_puck", "am_michael", "af_heart"]);
    expect(voiceTestFileName(0, "What does this log?", "am_puck", 1.1, true)).toBe("1-what-does-this-log-q-am_puck-1.1x.wav");
    expect(voiceTestFileName(2, "Ready?", "af_heart", 1, false)).toBe("3-ready-q-af_heart-1x-no-qc.wav");
  });

  it("writes one WAV per sentence and voice, through the real narration pipeline", async () => {
    const sent: string[] = [];
    const files = await runVoiceTest(silent, {
      sentences: QUESTIONS,
      voices: ["am_puck", "af_heart"],
      provider: "mock",
      speed: 1.1,
      outDir: out,
      makeProvider: (_name, cacheDir) => {
        const { provider, requests } = recording(cacheDir);
        return { ...provider, synthesize: (t, o) => (sent.push(t), requests.push({ text: t }), provider.synthesize(t, o)) };
      },
    });
    expect(files.map((f) => f.path.slice(out.length + 1))).toEqual([
      "1-so-does-it-log-one-or-three-q-am_puck-1.1x.wav",
      "1-so-does-it-log-one-or-three-q-af_heart-1.1x.wav",
      "2-what-does-this-log-q-am_puck-1.1x.wav",
      "2-what-does-this-log-q-af_heart-1.1x.wav",
      "3-guess-the-output-ready-q-am_puck-1.1x.wav",
      "3-guess-the-output-ready-q-af_heart-1.1x.wav",
    ]);
    for (const f of files) expect(existsSync(f.path)).toBe(true);
    expect(sent).toContain("Ready?");
    expect(sent).toContain("Guess the output.");
  });

  it("runs from the CLI and rejects a call with no sentence", async () => {
    const run = (args: string[]) =>
      promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli/index.ts", ...args]).then(
        (r) => ({ code: 0, ...r }),
        (e: { code: number; stdout: string; stderr: string }) => e,
      );
    const none = await run(["voice-test", "--provider", "mock"]);
    expect(none.code).toBe(1);
    expect(none.stderr).toContain("pass at least one sentence");
  });
});
