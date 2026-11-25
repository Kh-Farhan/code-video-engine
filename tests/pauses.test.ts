import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildManifestFromAudio, manifestToSrt } from "../src/cli/manifest";
import { continuousSceneWords, voiceContinuous } from "../src/cli/narration";
import { lintNarration, lintScript } from "../src/cli/narrationLint";
import { pipelinePaths } from "../src/cli/paths";
import { loadVoiceAudio, runVoice } from "../src/cli/voice";
import { sanitizeCaptionText, splitWords } from "../src/captions/text";
import { buildUploadPackage, loadMetadataConfig, renderUploadHtml, renderUploadMarkdown } from "../src/metadata";
import { pauseMarkerProblems, splitAtPauseMarkers, stripPauseMarkers } from "../src/schema/pauses";
import { parseScript, type Script } from "../src/schema/script";
import {
  createTtsProvider,
  defaultPauses,
  insertSilence,
  narrationBreaks,
  pauseMarkerPositions,
  planChunks,
  resolvePauses,
  shapeChunk,
  type MonoPcm,
  type TtsProvider,
} from "../src/tts";

const RATE = 8000;
const silent = { info: () => {} };

/** [kind, ms] pieces of silence or a loud tone. */
const signal = (...parts: ["tone" | "silence", number][]): MonoPcm => {
  const lengths = parts.map(([, ms]) => Math.round((ms * RATE) / 1000));
  const samples = new Float32Array(lengths.reduce((a, b) => a + b, 0));
  let at = 0;
  parts.forEach(([kind], i) => {
    for (let j = 0; j < lengths[i]!; j++) {
      samples[at + j] = kind === "tone" ? 0.5 * Math.sin((2 * Math.PI * 220 * j) / RATE) : 0;
    }
    at += lengths[i]!;
  });
  return { sampleRate: RATE, samples };
};
const lengthMs = (pcm: MonoPcm) => (pcm.samples.length * 1000) / pcm.sampleRate;

/** Silence between consecutive spans (ms). */
const gapsBetween = (spans: readonly { startMs: number; endMs: number }[]) =>
  spans.slice(1).map((s, i) => s.startMs - spans[i]!.endMs);

const minimalScript = (narrations: string[], style?: Script["style"]): Script => {
  const parsed = parseScript({
    title: "Pauses",
    ...(style ? { style } : {}),
    scenes: narrations.map((narration, i) =>
      i === 0
        ? { type: "title", heading: "Pauses", narration }
        : { type: "code", language: "typescript", code: "run()\nwait()\nreturn ui", narration, highlight: [{ from: 3, to: 3, cue: "then" }] },
    ),
  });
  if (!parsed.success) throw new Error(parsed.errors.join("\n"));
  return parsed.data;
};

describe("pause settings", () => {
  it("defaults to 700ms -> 450ms, comma 150, sentence 300, scene 350, [pause] 300", () => {
    expect(resolvePauses()).toEqual({
      maxMs: 700,
      shortenToMs: 450,
      commaMs: 150,
      sentenceMs: 300,
      sceneMs: 350,
      markerMs: 300,
    });
    expect(resolvePauses({ commaMs: 200, markerMs: 600 })).toMatchObject({ commaMs: 200, markerMs: 600, maxMs: 700 });
    // Never shorten a pause to something longer than the limit.
    expect(resolvePauses({ maxMs: 300 }).shortenToMs).toBe(300);
  });

  it("is configurable in the script's style block and validated", () => {
    const ok = parseScript({
      title: "T",
      style: { look: "grid", pauses: { maxMs: 800, shortenToMs: 500, sceneMs: 400 } },
      scenes: [{ type: "title", heading: "H", narration: "Hi." }],
    });
    expect(ok.success).toBe(true);
    const bad = parseScript({
      title: "T",
      style: { pauses: { maxMs: 400, shortenToMs: 500, breathMs: 3 } },
      scenes: [{ type: "title", heading: "H", narration: "Hi." }],
    });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.errors.join("\n")).toMatch(/breathMs/);
    const inverted = parseScript({
      title: "T",
      style: { pauses: { maxMs: 400, shortenToMs: 500 } },
      scenes: [{ type: "title", heading: "H", narration: "Hi." }],
    });
    expect(inverted.success).toBe(false);
    if (!inverted.success) expect(inverted.errors.join("\n")).toMatch(/shortenToMs must not be longer than maxMs/);
  });
});

describe("pause markers", () => {
  it("parses [pause] and [pause:500] and strips them", () => {
    expect(stripPauseMarkers("comes first [pause] then returns")).toBe("comes first then returns");
    expect(stripPauseMarkers("first [pause:500], then [PAUSE : 250ms] go.")).toBe("first, then go.");
    expect(splitAtPauseMarkers("comes first [pause] then [pause:500] returns.", 300)).toEqual([
      { text: "comes first", pauseAfterMs: 300 },
      { text: "then", pauseAfterMs: 500 },
      { text: "returns." },
    ]);
    // Markers in a row add up; a bare marker without a default stays null for the caller.
    expect(splitAtPauseMarkers("a [pause:200] [pause:300] b")).toEqual([
      { text: "a", pauseAfterMs: 500 },
      { text: "b" },
    ]);
    expect(splitAtPauseMarkers("a [pause] b")[0]!.pauseAfterMs).toBeNull();
    expect(pauseMarkerPositions("[pause] One, two [pause:500] three.")).toEqual([
      { afterWord: -1, ms: 300 },
      { afterWord: 1, ms: 500 },
    ]);
  });

  it("reports typos and out-of-range markers instead of speaking them", () => {
    expect(pauseMarkerProblems("a [pause] b [pause:500] c")).toEqual([]);
    expect(pauseMarkerProblems("a [pause:abc] b")[0]).toMatch(/not a pause marker/);
    expect(pauseMarkerProblems("a [pause:10] b")[0]).toMatch(/50 to 3000ms/);
    expect(pauseMarkerProblems("[pause]")).toContain("must have words besides pause markers");
    const parsed = parseScript({
      title: "T",
      scenes: [{ type: "title", heading: "H", narration: "Wait [pause:9000] for it." }],
    });
    expect(parsed.success).toBe(false);
  });

  it("never reaches captions, cues or upload metadata", () => {
    expect(splitWords("comes first [pause] then returns [pause:450].")).toEqual([
      "comes",
      "first",
      "then",
      "returns.",
    ]);
    expect(sanitizeCaptionText("Done. [pause] Next")).toBe("Done. Next");

    const script = minimalScript([
      "Promise.race settles [pause] with whichever comes first.",
      "It waits for the timer or the fetch, whichever comes first [pause:500] then returns to the UI.",
    ]);
    const pkg = buildUploadPackage(script, "pauses", loadMetadataConfig());
    expect(renderUploadMarkdown(pkg)).not.toMatch(/\[\s*pause/i);
    expect(renderUploadHtml(pkg)).not.toMatch(/\[\s*pause/i);
    expect(pkg.transcript.join(" ")).toContain("whichever comes first then returns to the UI.");
  });
});

describe("where pauses are owed", () => {
  it("finds commas, sentence ends, scene boundaries and markers", () => {
    const b = narrationBreaks(["One, two. Three [pause:500] four", "[pause] Five e.g. six."]);
    expect(b.words).toEqual(["One,", "two.", "Three", "four", "Five", "e.g.", "six."]);
    expect(b.spoken).toEqual(["One,", "two.", "Three", "four.", "Five", "e.g.", "six."]);
    expect(b.breaks).toEqual([
      { kind: "comma", minMs: 150 },
      { kind: "sentence", minMs: 300 },
      { markerMs: 500, minMs: 500 },
      // The marker at the start of scene 2 is a pause after scene 1, on top of the scene minimum.
      { kind: "scene", markerMs: 300, minMs: 350 },
      undefined,
      undefined, // "e.g." does not end a sentence
      undefined, // the end of the script
    ]);
  });

  it("splits synthesis only at markers, and at sentences when the provider has a limit", () => {
    const b = narrationBreaks(["Long sentence one goes here, with a clause. Short two.", "Then [pause] go."]);
    expect(planChunks(b).map((c) => c.text)).toEqual([
      "Long sentence one goes here, with a clause. Short two. Then",
      "go.",
    ]);
    const limited = planChunks(b, 30).map((c) => c.text);
    expect(limited).toEqual(["Long sentence one goes here, with a clause.", "Short two. Then", "go."]);
    // Never inside a clause: every chunk but one ending at a marker ends a sentence.
    expect(limited.slice(0, 1).every((t) => /[.!?]$/.test(t))).toBe(true);
  });
});

describe("shaping a chunk", () => {
  it("keeps natural pauses, shortens only those over 700ms and pads short ones to the minimum", () => {
    // "Alpha, beta. Gamma delta" as four tones: comma pause 60ms (too short),
    // sentence pause 500ms (natural, kept), and a 1000ms pause with nothing owed (shortened).
    const raw = signal(
      ["silence", 300],
      ["tone", 400],
      ["silence", 60],
      ["tone", 400],
      ["silence", 500],
      ["tone", 400],
      ["silence", 1000],
      ["tone", 400],
      ["silence", 300],
    );
    const words = ["Alpha,", "beta.", "Gamma", "delta"];
    const breaks = narrationBreaks([words.join(" ")]).breaks;
    const out = shapeChunk(raw, words, breaks, undefined);
    expect(out.hasSpeech).toBe(true);
    expect(out.pausesShortened).toBe(1);
    expect(out.padded).toBe(1);
    expect(out.paddedMs).toBeCloseTo(90, 0);
    expect(out.unplaced).toBe(0);
    // 40 lead + 4 tones + 150 (padded comma) + 500 (kept) + 450 (shortened) + 80 tail.
    expect(lengthMs(out.pcm)).toBeCloseTo(40 + 1600 + 150 + 500 + 450 + 80, -1);
    // Word spans are cut at the pauses and sit on the final audio.
    expect(out.spans.map((s) => [s.from, s.to])).toEqual([[0, 1], [1, 2], [2, 4]]);
    const gaps = gapsBetween(out.spans);
    expect(gaps[0]).toBeCloseTo(150, -1);
    expect(gaps[1]).toBeCloseTo(500, -1);
  });

  it("uses the provider's sentence spans when it reports them", () => {
    const raw = signal(["tone", 400], ["silence", 120], ["tone", 400]);
    const words = ["Done.", "Next."];
    const segments = [
      { text: "Done.", startMs: 0, endMs: 400 },
      { text: "Next.", startMs: 520, endMs: 920 },
    ];
    const out = shapeChunk(raw, words, narrationBreaks(["Done. Next."]).breaks, segments);
    expect(gapsBetween(out.spans)[0]).toBeCloseTo(300, -1);
  });

  it("puts the pause where the words should end in silent (mock) audio", () => {
    const raw = signal(["silence", 2000]);
    const words = ["One,", "two", "three.", "Four"];
    const out = shapeChunk(raw, words, narrationBreaks([words.join(" ")]).breaks, undefined);
    expect(out.hasSpeech).toBe(false);
    expect(lengthMs(out.pcm)).toBeCloseTo(2000 + 150 + 300, 0);
    expect(gapsBetween(out.spans)).toEqual([150, 300].map((v) => expect.closeTo(v, 0)));
  });

  it("leaves a pause it cannot find as spoken instead of cutting a word", () => {
    const raw = signal(["silence", 100], ["tone", 1500], ["silence", 100]);
    const words = ["Alpha,", "beta", "gamma", "delta"];
    const out = shapeChunk(raw, words, narrationBreaks([words.join(" ")]).breaks, undefined);
    expect(out.unplaced).toBe(1);
    expect(out.padded).toBe(0);
  });

  it("inserts silence and maps times before and after it", () => {
    const { pcm, map } = insertSilence(signal(["tone", 1000]), [{ atMs: 400, ms: 250 }]);
    expect(lengthMs(pcm)).toBeCloseTo(1250, 6);
    expect(map(100)).toBe(100);
    expect(map(400, "before")).toBe(400);
    expect(map(400, "after")).toBe(650);
    expect(map(900)).toBe(1150);
  });
});

describe("continuous track with pauses", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "cve-pauses-"));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const pathsFor = (name: string) =>
    pipelinePaths("pauses", { publicDir: join(root, name, "public"), outRoot: join(root, name, "out") });

  const narrations = [
    "Promise.race settles with the first result, then it is done.",
    "It waits for the timer or the fetch, whichever comes first [pause:500] then returns to the UI.",
  ];

  it("splits synthesis at markers and puts every minimum pause on the final timeline", async () => {
    const paths = pathsFor("mock");
    const mock = createTtsProvider("mock", { cacheDir: paths.audioDir });
    const requests: string[] = [];
    const provider: TtsProvider = { ...mock, name: "mock", defaultVoiceId: "mock", synthesize: (t, o) => (requests.push(t), mock.synthesize(t, o)) };
    const script = minimalScript(narrations);
    const track = await voiceContinuous(script, provider, silent, paths);
    expect(requests).toEqual([
      "Promise.race settles with the first result, then it is done. It waits for the timer or the fetch, whichever comes first",
      "then returns to the UI.",
    ]);
    const scenes = continuousSceneWords(narrations, track);
    const words = scenes.flatMap((s) => s.words);
    expect(words.map((w) => w.text.trim())).toEqual(narrations.flatMap(splitWords));
    expect(words.some((w) => /pause/.test(w.text))).toBe(false);
    const gapAfter = (word: string) => {
      const i = words.map((w) => w.text.trim()).lastIndexOf(word);
      return words[i + 1]!.startMs - words[i]!.endMs;
    };
    expect(gapAfter("result,")).toBeGreaterThanOrEqual(defaultPauses.commaMs - 1);
    expect(gapAfter("done.")).toBeGreaterThanOrEqual(defaultPauses.sceneMs - 1);
    expect(gapAfter("fetch,")).toBeGreaterThanOrEqual(defaultPauses.commaMs - 1);
    expect(gapAfter("first")).toBeGreaterThanOrEqual(499);
    // Without pauses the same text would be shorter by at least the owed silence.
    expect(track.durationSeconds * 1000).toBeGreaterThan(
      (splitWords(narrations.join(" ")).length / 150) * 60_000 + 150 * 2 + 350 + 500 - 5,
    );
  });

  it("keeps captions, SRT and highlight cues in sync with the padded track", async () => {
    const paths = pathsFor("manifest");
    const script = minimalScript(narrations, { pauses: { markerMs: 400 } });
    await runVoice(script, "pauses", "mock", paths, silent);
    const loaded = await loadVoiceAudio(script, paths);
    const m = buildManifestFromAudio(script, "pauses", loaded);
    const srt = manifestToSrt(m);
    const srtText = srt.split("\n").filter((l) => !/^\d+$|-->/.test(l)).join(" ");
    expect(srtText.replace(/\s+/g, " ")).toContain("whichever comes first then returns");
    expect(srt).not.toMatch(/pause/i);
    // The second scene starts on its first word, after the scene pause.
    const scene = m.scenes[1]!;
    const caps = scene.words!.captions;
    const first = caps.findIndex((c) => c.text.trim() === "first");
    expect(caps[first + 1]!.startMs - caps[first]!.endMs).toBeGreaterThanOrEqual(499);
    // The highlight cue "then" fires on the word as spoken on the final track.
    expect(caps.map((c) => c.text.trim())).toEqual(splitWords(script.scenes[1]!.narration));
    expect(scene.captions.cues.some((c) => c.text.includes("pause"))).toBe(false);
  });
});

describe("narration linter", () => {
  it("flags a clause word with no pause before it, with the phrase and a fix", () => {
    const [w, ...rest] = lintNarration(
      "It waits for the timer or the fetch, whichever comes first then returns to the UI.",
      2,
      "code",
    );
    expect(rest).toEqual([]);
    expect(w).toMatchObject({
      scene: 2,
      rule: "clause-word",
      phrase: "whichever comes first then returns to",
      suggestion: "whichever comes first, then returns to",
    });
    expect(w!.message).toMatch(/^scene 3 \(code\): no pause before "then"/);
  });

  it("flags a long sentence with no comma", () => {
    const text = "This sentence keeps going on and on for far more than sixteen words without any break at all.";
    const warnings = lintNarration(text);
    expect(warnings.map((w) => w.rule)).toEqual(["long-sentence"]);
    expect(warnings[0]!.phrase).toBe(text);
    expect(warnings[0]!.suggestion).toMatch(/split it into two sentences/);
  });

  it("accepts a comma, a marker, a short sentence or a word that does not start a clause", () => {
    expect(lintNarration("It waits for the timer or the fetch, whichever comes first, then returns to the UI.")).toEqual([]);
    expect(lintNarration("It waits for the timer or the fetch, whichever comes first [pause] then returns to the UI.")).toEqual([]);
    expect(lintNarration("React renders first then commits.")).toEqual([]);
    expect(lintNarration("Use a stable key from your data instead of the array index in this list.")).toEqual([]);
    expect(lintNarration("Hide the delete button from everyone but admins and the owner of the post.")).toEqual([]);
    expect(lintNarration("By then that one has already landed and replaced the state.")).toEqual([]);
    expect(lintNarration("The old request finishes after the new one and the page looks done instead.")).toEqual([]);
    // "and then": the pause goes before "and".
    expect(lintNarration("The first fetch resolves late and then the stale user replaces the new one.")[0]?.suggestion).toBe(
      "fetch resolves late, and then the",
    );
  });

  it("lints every scene of a script", () => {
    const script = minimalScript(["This is a short title.", "It waits for the timer or the fetch, whichever comes first then returns to the UI."]);
    expect(lintScript(script).map((w) => w.scene)).toEqual([1]);
  });
});
