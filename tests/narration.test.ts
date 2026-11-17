import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildContinuousManifest, buildManifestFromAudio, manifestToSrt } from "../src/cli/manifest";
import { loadScriptFile } from "../src/cli/loadScript";
import { continuousSceneWords, voiceContinuous } from "../src/cli/narration";
import { pipelinePaths } from "../src/cli/paths";
import { loadSceneAudio, loadVoiceAudio, runVoice } from "../src/cli/voice";
import { splitWords } from "../src/captions/text";
import { narrationWindows } from "../src/components/musicDucking";
import { parseManifest, totalDurationInFrames, type WordCaption } from "../src/schema/manifest";
import type { Script } from "../src/schema/script";
import { NARRATION_TAIL_SECONDS } from "../src/theme";
import {
  chunkAtSentences,
  decodeWav,
  encodeWav,
  ensureSentenceEnd,
  joinChunks,
  joinNarration,
  measureAudioDuration,
  speechBounds,
  splitSentences,
  tightenPauses,
  type MonoPcm,
  type TtsProvider,
} from "../src/tts";

const RATE = 8000;
const silent = { info: () => {} };

/** A test signal: [kind, ms] pieces of silence or a loud tone. */
const signal = (...parts: ["tone" | "silence", number][]): MonoPcm => {
  const lengths = parts.map(([, ms]) => Math.round((ms * RATE) / 1000));
  const samples = new Float32Array(lengths.reduce((a, b) => a + b, 0));
  let at = 0;
  parts.forEach(([kind, _], i) => {
    for (let j = 0; j < lengths[i]!; j++) {
      samples[at + j] = kind === "tone" ? 0.5 * Math.sin((2 * Math.PI * 220 * j) / RATE) : 0;
    }
    at += lengths[i]!;
  });
  return { sampleRate: RATE, samples };
};

const ms = (pcm: MonoPcm) => (pcm.samples.length * 1000) / pcm.sampleRate;

const loadExample = (): Script => {
  const result = loadScriptFile("scripts/example-usememo.yaml");
  if (!result.success) throw new Error(result.errors.join("\n"));
  return result.data;
};

describe("narration text", () => {
  it("joins scene narrations in order, each ending a sentence", () => {
    expect(ensureSentenceEnd("No punctuation")).toBe("No punctuation.");
    expect(ensureSentenceEnd("Already done?")).toBe("Already done?");
    expect(ensureSentenceEnd('A "quote."')).toBe('A "quote."');
    expect(joinNarration(["First scene.", "  Second\n scene ", "Third!"])).toBe(
      "First scene. Second scene. Third!",
    );
  });

  it("splits only at sentence boundaries when a provider limits input length", () => {
    const text = "One two. Three four five! Six? Seven eight nine ten.";
    expect(splitSentences(text)).toEqual(["One two.", "Three four five!", "Six?", "Seven eight nine ten."]);
    expect(chunkAtSentences(text)).toEqual([text]);
    expect(chunkAtSentences(text, 1000)).toEqual([text]);
    const chunks = chunkAtSentences(text, 30);
    expect(chunks).toEqual(["One two. Three four five! Six?", "Seven eight nine ten."]);
    expect(chunks.join(" ")).toBe(text);
    // A sentence over the limit is kept whole, never cut.
    expect(chunkAtSentences("A very long sentence here. B.", 10)).toEqual(["A very long sentence here.", "B."]);
  });
});

describe("audio stitching", () => {
  it("joins chunks with 120ms of silence and fades at the seams", () => {
    const a = signal(["tone", 500]);
    const b = signal(["tone", 300]);
    const { pcm, offsetsMs } = joinChunks([a, b]);
    expect(ms(pcm)).toBeCloseTo(920, 6);
    expect(offsetsMs).toEqual([0, 620]);
    const at = (t: number) => pcm.samples[Math.round((t * RATE) / 1000)]!;
    // The gap is silent and the edges are faded to zero.
    expect(Math.abs(at(560))).toBe(0);
    expect(Math.abs(at(499.9))).toBeLessThan(0.01);
    expect(Math.abs(pcm.samples[Math.round((620 * RATE) / 1000)]!)).toBeLessThan(0.01);
    expect(() => joinChunks([a, { sampleRate: 16000, samples: new Float32Array(10) }])).toThrow(
      /different sample rates/,
    );
  });

  it("trims leading and trailing silence and shortens only pauses over 700ms, to 450ms", () => {
    const raw = signal(
      ["silence", 500],
      ["tone", 300],
      ["silence", 600], // natural: kept
      ["tone", 300],
      ["silence", 800], // too long: shortened
      ["tone", 300],
      ["silence", 700],
    );
    const out = tightenPauses(raw);
    expect(out.hasSpeech).toBe(true);
    expect(out.pausesShortened).toBe(1);
    // 40ms lead + 300 + 600 + 300 + 450 + 300 + 80ms tail.
    expect(ms(out.pcm)).toBeCloseTo(2070, 0);
    expect(out.removedMs).toBeCloseTo(ms(raw) - 2070, 0);
    // Speech lands where the edits say: the first tone starts 40ms in.
    expect(out.map(500)).toBeCloseTo(40, 0);
    expect(out.map(1400)).toBeCloseTo(940, 0);
    expect(out.map(2500)).toBeCloseTo(1690, 0);
    // Times inside a cut collapse onto the cut; the map never goes backwards.
    const times = [0, 100, 600, 1300, 1500, 1800, 2000, 2600, 3300];
    const mapped = times.map(out.map);
    mapped.slice(1).forEach((m, i) => expect(m).toBeGreaterThanOrEqual(mapped[i]!));
    expect(mapped.at(-1)).toBeCloseTo(ms(out.pcm), 6);
  });

  it("leaves silent audio (mock) untouched", () => {
    const raw = signal(["silence", 900]);
    const out = tightenPauses(raw);
    expect(out.hasSpeech).toBe(false);
    expect(out.pcm).toBe(raw);
    expect(out.map(450)).toBe(450);
  });

  it("finds the speech inside a span", () => {
    const pcm = signal(["silence", 200], ["tone", 300], ["silence", 200]);
    const bounds = speechBounds(pcm);
    expect(bounds(0, 700)).toEqual({ startMs: 200, endMs: 500 });
    expect(bounds(300, 700)).toEqual({ startMs: 300, endMs: 500 });
    expect(bounds(550, 700)).toBeUndefined();
  });

  it("round-trips WAV", () => {
    const pcm = signal(["tone", 50]);
    const back = decodeWav(encodeWav(pcm));
    expect(back.sampleRate).toBe(RATE);
    expect(back.samples.length).toBe(pcm.samples.length);
    back.samples.forEach((s, i) => expect(s).toBeCloseTo(pcm.samples[i]!, 3));
  });
});

const caps = (words: string[], startMs: number, stepMs: number): WordCaption[] =>
  words.map((w, i) => ({
    text: i === 0 ? w : ` ${w}`,
    startMs: startMs + i * stepMs,
    endMs: startMs + i * stepMs + stepMs - 20,
    timestampMs: null,
    confidence: null,
  }));

describe("word timing on the track", () => {
  const narrations = ["Hello there.", "Second scene now."];

  it("uses whisper's words when they cover the script, split per scene", () => {
    const aligned = caps(["Hello", "there.", "Second", "scene", "now."], 100, 300);
    const scenes = continuousSceneWords(narrations, { segments: [], durationSeconds: 2 }, aligned);
    expect(scenes.map((s) => s.source)).toEqual(["aligned", "aligned"]);
    expect(scenes[1]!.words.map((w) => w.text)).toEqual(["Second", " scene", " now."]);
    expect(scenes[1]!.words[0]!.startMs).toBe(700);
  });

  it("otherwise spreads words inside the provider's sentence spans", () => {
    const segments = [
      { text: "Hello there.", startMs: 0, endMs: 1000 },
      { text: "Second scene now.", startMs: 1300, endMs: 2500 },
    ];
    const scenes = continuousSceneWords(narrations, { segments, durationSeconds: 2.6 });
    expect(scenes.map((s) => s.source)).toEqual(["estimated", "estimated"]);
    expect(scenes[0]!.words[0]!.startMs).toBe(0);
    expect(scenes[0]!.words.at(-1)!.endMs).toBe(1000);
    // The second scene starts exactly where its sentence starts.
    expect(scenes[1]!.words[0]!.startMs).toBe(1300);
    expect(scenes[1]!.words.at(-1)!.endMs).toBe(2500);
  });
});

describe("continuous manifest", () => {
  const script = loadExample();
  const fps = 30;
  // Every word 250ms, a 250ms pause between scenes, starting 40ms in.
  const timed = (() => {
    let at = 40;
    return script.scenes.map((s) => {
      const words = splitWords(s.narration);
      const c = caps(words, at, 250);
      at += words.length * 250 + 250;
      return { narration: s.narration, words: c, source: "aligned" as const };
    });
  })();
  const lastEnd = timed.at(-1)!.words.at(-1)!.endMs;
  const narration = { audio: "audio/example-usememo/narration-x.wav", durationSeconds: (lastEnd + 80) / 1000, scenes: timed };

  it("starts each scene on its first word, with no padding and a 0.6s tail", () => {
    const m = buildContinuousManifest(script, "example-usememo", narration, fps);
    expect(parseManifest(m).success).toBe(true);
    expect(m.narration?.src).toBe(narration.audio);
    expect(m.scenes.every((s) => s.audio === undefined)).toBe(true);

    let start = 0;
    m.scenes.forEach((s, k) => {
      const expected = k === 0 ? 0 : Math.round((timed[k]!.words[0]!.startMs * fps) / 1000);
      expect(start).toBe(expected);
      start += s.durationInFrames;
    });
    const total = Math.ceil(((lastEnd + NARRATION_TAIL_SECONDS * 1000) * fps) / 1000);
    expect(totalDurationInFrames(m)).toBe(total);
    expect(m.narration?.durationInFrames).toBe(total);
  });

  it("keeps captions and highlight cue words on the track, offset into each scene", () => {
    const m = buildContinuousManifest(script, "example-usememo", narration, fps);
    let offsetMs = 0;
    m.scenes.forEach((s, k) => {
      expect(s.words?.source).toBe("aligned");
      expect(s.words!.captions.map((c) => c.text.trim())).toEqual(splitWords(script.scenes[k]!.narration));
      // Scene-relative word time + scene start = track time (to the frame).
      s.words!.captions.forEach((c, i) => {
        expect(Math.abs(c.startMs + offsetMs - timed[k]!.words[i]!.startMs)).toBeLessThanOrEqual(1000 / fps);
      });
      expect(s.captions.cues.at(-1)!.endFrame).toBeLessThanOrEqual(s.durationInFrames);
      offsetMs += (s.durationInFrames * 1000) / fps;
    });
    // Scenes after the first start on their first word.
    m.scenes.slice(1).forEach((s) => expect(s.captions.cues[0]!.startFrame).toBe(0));
    expect(manifestToSrt(m)).toContain("Most useMemo calls cost more");
  });

  it("ducks music under one long window instead of pumping between scenes", () => {
    const m = buildContinuousManifest(script, "example-usememo", narration, fps);
    const windows = narrationWindows(m);
    windows.slice(1).forEach((w, i) => expect(w.startFrame - windows[i]!.endFrame).toBeLessThan(15));
  });

  it("requires per-scene audio when there is no narration track", () => {
    const m = buildContinuousManifest(script, "example-usememo", narration, fps);
    const { narration: _n, ...withoutTrack } = m;
    const parsed = parseManifest(withoutTrack);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.errors[0]).toMatch(/needs its own audio/);
  });
});

describe("voice: continuous narration", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "cve-narration-"));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const pathsFor = (name: string) =>
    pipelinePaths("example-usememo", { publicDir: join(root, name, "public"), outRoot: join(root, name, "out") });

  it("voices the whole script in one mock pass and builds a padding-free manifest", async () => {
    const script = loadExample();
    const paths = pathsFor("mock");
    const texts: string[] = [];
    const index = await runVoice(script, "example-usememo", "mock", paths, { info: (l) => texts.push(l) });
    if (index.version !== 2) throw new Error("expected a continuous index");
    expect(index.narration.chunks).toBe(1);
    expect(index.narration.audio).toMatch(/^audio\/example-usememo\/narration-[0-9a-f]+\.wav$/);
    expect(existsSync(join(paths.publicDir, index.narration.audio))).toBe(true);
    expect(texts).toContain("voicing the whole script as one continuous narration");
    // Mock has no word timing, so words follow its sentence spans.
    expect(index.scenes.every((s) => s.source === "estimated")).toBe(true);
    expect(index.scenes.map((s) => s.words.length)).toEqual(
      script.scenes.map((s) => splitWords(s.narration).length),
    );

    const loaded = await loadVoiceAudio(script, paths);
    expect(loaded.mode).toBe("continuous");
    const m = buildManifestFromAudio(script, "example-usememo", loaded);
    expect(m.narration).toBeDefined();
    const lastWordMs = Math.max(...index.scenes.flatMap((s) => s.words.map((w) => w.endMs)));
    expect(totalDurationInFrames(m)).toBe(
      Math.max(Math.ceil(((lastWordMs + 600) * 30) / 1000), Math.ceil(index.narration.durationSeconds * 30)),
    );
    // One file per scene is only for --per-scene-audio.
    await expect(loadSceneAudio(script, paths)).rejects.toThrow(/one continuous narration/);

    const edited: Script = {
      ...script,
      scenes: script.scenes.map((s, i) => (i === 1 ? { ...s, narration: "Changed." } : s)),
    };
    await expect(loadVoiceAudio(edited, paths)).rejects.toThrow(/narration of scene 2 changed/);
  });

  it("keeps the per-scene mode behind perSceneAudio", async () => {
    const script = loadExample();
    const paths = pathsFor("per-scene");
    const index = await runVoice(script, "example-usememo", "mock", paths, silent, undefined, undefined, {
      perSceneAudio: true,
    });
    expect(index.version).toBe(1);
    const loaded = await loadVoiceAudio(script, paths);
    expect(loaded.mode).toBe("per-scene");
    const m = buildManifestFromAudio(script, "example-usememo", loaded);
    expect(m.narration).toBeUndefined();
    expect(m.scenes.every((s) => typeof s.audio === "string")).toBe(true);
  });

  it("splits at sentences for a provider with a length limit and stitches the chunks", async () => {
    const paths = pathsFor("chunked");
    await mkdir(paths.audioDir, { recursive: true });
    const requests: string[] = [];
    // Each chunk: 100ms silence, 200ms tone per sentence with 500ms pauses, 100ms silence.
    const provider: TtsProvider = {
      name: "elevenlabs",
      defaultVoiceId: "v",
      maxInputChars: 40,
      async synthesize(text) {
        requests.push(text);
        const sentences = splitSentences(text);
        const parts: ["tone" | "silence", number][] = [["silence", 100]];
        sentences.forEach((_, i) => parts.push(["tone", 200], ["silence", i < sentences.length - 1 ? 500 : 100]));
        const path = join(paths.audioDir, `chunk-${text.length}.wav`);
        await writeFile(path, encodeWav(signal(...parts)));
        return { path, durationSeconds: 0, cached: false };
      },
    };
    const script: Pick<Script, "scenes"> = {
      scenes: [
        { type: "title", heading: "H", narration: "First sentence here. Second one" },
        { type: "outro", text: "Bye", narration: "Third sentence is longer than that. Four." },
      ] as Script["scenes"],
    };
    const track = await voiceContinuous(script, provider, silent, paths);
    expect(requests).toEqual(["First sentence here. Second one.", "Third sentence is longer than that.", "Four."]);
    expect(track.chunks).toBe(3);
    expect(track.hasSpeech).toBe(true);
    // 4 tones of 200ms; the natural 500ms pause inside chunk 1 is kept; the
    // seams get exactly their minimum: 350ms between scenes, 300ms between
    // sentences (edge silence included); 40ms lead, 80ms tail.
    expect(track.durationSeconds).toBeCloseTo((4 * 200 + 500 + 350 + 300 + 40 + 80) / 1000, 2);
    expect(await measureAudioDuration(join(paths.publicDir, track.audio))).toBeCloseTo(track.durationSeconds, 3);
    // Without per-sentence segments, each chunk's speech is cut at the pauses found in it.
    expect(track.segments.map((s) => s.text)).toEqual([
      "First sentence here.",
      "Second one",
      "Third sentence is longer than that.",
      "Four.",
    ]);
    expect(track.segments[0]!.startMs).toBeCloseTo(40, -1);
    expect(track.segments[1]!.startMs - track.segments[0]!.endMs).toBeCloseTo(500, -1);
    expect(track.segments[2]!.startMs - track.segments[1]!.endMs).toBeCloseTo(350, -1);
    expect(track.segments[3]!.startMs - track.segments[2]!.endMs).toBeCloseTo(300, -1);
    const scenes = continuousSceneWords(script.scenes.map((s) => s.narration), track);
    // Scene 2 begins with the second chunk.
    expect(scenes[1]!.words[0]!.startMs).toBeCloseTo(track.segments[2]!.startMs, 0);
    // Same input, same file: the processed track is reused.
    const again = await voiceContinuous(script, provider, silent, paths);
    expect(again.audio).toBe(track.audio);
    expect(new Uint8Array(await readFile(join(paths.publicDir, again.audio))).length).toBeGreaterThan(44);
  });
});
