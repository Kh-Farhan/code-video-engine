import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadScriptFile } from "../src/cli/loadScript";
import { buildManifest, manifestToSrt, thumbnailFrame } from "../src/cli/manifest";
import { pipelinePaths } from "../src/cli/paths";
import { createReporter } from "../src/cli/progress";
import { loadSceneAudio, resolveVoice, runVoice, voiceScript } from "../src/cli/voice";
import { parseScript } from "../src/schema/script";
import type { TtsProvider } from "../src/tts";
import { parseManifest } from "../src/schema/manifest";
import type { Script } from "../src/schema/script";
import { SCENE_PADDING_FRAMES } from "../src/theme";

const EXAMPLE = "scripts/example-usememo.yaml";

const loadExample = (): Script => {
  const result = loadScriptFile(EXAMPLE);
  if (!result.success) throw new Error(result.errors.join("\n"));
  return result.data;
};

const silent = { info: () => {} };

describe("buildManifest", () => {
  const script = loadExample();
  const audio = script.scenes.map((_, i) => ({
    audio: `audio/example-usememo/${i}.wav`,
    durationSeconds: 2 + i * 0.51,
  }));

  it("pads each scene's audio by 0.4s and keeps captions inside the spoken part", () => {
    const manifest = buildManifest(script, "example-usememo", audio);
    expect(SCENE_PADDING_FRAMES).toBe(12);
    expect(parseManifest(manifest).success).toBe(true);
    manifest.scenes.forEach((s, i) => {
      const audioFrames = Math.ceil(audio[i]!.durationSeconds * 30);
      expect(s.durationInFrames).toBe(audioFrames + SCENE_PADDING_FRAMES);
      expect(s.audio).toBe(audio[i]!.audio);
      expect(s.captions.granularity).toBe("word");
      expect(s.captions.cues.length).toBeGreaterThan(0);
      expect(s.captions.cues.at(-1)!.endFrame).toBeLessThanOrEqual(audioFrames);
    });
  });

  it("rejects audio that does not cover every scene", () => {
    expect(() => buildManifest(script, "example-usememo", audio.slice(1))).toThrow(
      /Expected audio for 6 scenes, got 5/,
    );
  });

  it("writes an SRT whose cues stay within the video", () => {
    const manifest = buildManifest(script, "example-usememo", audio);
    const srt = manifestToSrt(manifest);
    expect(srt.startsWith("1\n00:00:00,000 --> ")).toBe(true);
    expect(srt).toContain("You probably use useMemo");
    expect(srt).not.toContain("—");
  });

  it("puts the thumbnail inside the title scene, after it settles and before the fade", () => {
    const manifest = buildManifest(script, "example-usememo", audio);
    expect(thumbnailFrame(manifest)).toBe(45);

    const titleSecond = { ...manifest, scenes: [manifest.scenes[1]!, manifest.scenes[0]!] };
    expect(thumbnailFrame(titleSecond)).toBe(manifest.scenes[1]!.durationInFrames + 45);

    const shortTitle = buildManifest(
      { title: "T", scenes: [script.scenes[0]!] },
      "t",
      [{ audio: "a.wav", durationSeconds: 0.5 }],
    );
    const d = shortTitle.scenes[0]!.durationInFrames;
    expect(thumbnailFrame(shortTitle)).toBeLessThan(d - 1);
  });
});

describe("voice and audio index", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "cve-cli-"));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("generates mock audio per scene and reads it back for the manifest", async () => {
    const script = loadExample();
    const paths = pipelinePaths("example-usememo", {
      publicDir: join(root, "public"),
      outRoot: join(root, "out"),
    });
    const index = await runVoice(script, "example-usememo", "mock", paths, silent);
    expect(index.provider).toBe("mock");
    expect(index.scenes).toHaveLength(script.scenes.length);
    for (const s of index.scenes) {
      expect(s.audio).toMatch(/^audio\/example-usememo\/mock-[0-9a-f]+\.wav$/);
      expect(existsSync(join(paths.publicDir, s.audio))).toBe(true);
    }
    expect(existsSync(paths.voiceIndex)).toBe(true);

    const audio = await loadSceneAudio(script, paths);
    expect(audio.map((a) => a.durationSeconds)).toEqual(
      index.scenes.map((s) => s.durationSeconds),
    );

    const edited: Script = {
      ...script,
      scenes: script.scenes.map((s, i) => (i === 2 ? { ...s, narration: "Changed." } : s)),
    };
    await expect(loadSceneAudio(edited, paths)).rejects.toThrow(
      /narration of scene 3 changed\. Run `pnpm video voice` again/,
    );
    await expect(
      loadSceneAudio({ ...script, scenes: script.scenes.slice(1) }, paths),
    ).rejects.toThrow(/script has 5 scenes but the audio covers 6/);
  });

  it("explains a missing audio index", async () => {
    const paths = pipelinePaths("nothing-here", { publicDir: join(root, "empty") });
    await expect(loadSceneAudio(loadExample(), paths)).rejects.toThrow(
      /No readable audio index .* Run `pnpm video voice` first/,
    );
  });
});

describe("progress output", () => {
  it("numbers steps and reports failures", async () => {
    const lines: string[] = [];
    const report = createReporter(2, (l) => lines.push(l));
    await report.step("First", () => report.info("detail"));
    await expect(
      report.step("Second", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(lines[0]).toBe("\n[1/2] First");
    expect(lines[1]).toBe("  detail");
    expect(lines[2]).toMatch(/^ {2}done in \d+ms$/);
    expect(lines[3]).toBe("\n[2/2] Second");
    expect(lines[4]).toMatch(/^ {2}failed after \d+ms$/);
  });
});

describe("pnpm video validate", () => {
  const run = (args: string[]) =>
    promisify(execFile)(process.execPath, ["--import", "tsx", "src/cli/index.ts", ...args]).then(
      (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
      (e: { code: number; stdout: string; stderr: string }) => e,
    );

  it("accepts the example script", async () => {
    const r = await run(["validate", EXAMPLE]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('"When NOT to use useMemo" (example-usememo)');
    expect(r.stdout).toContain("6 scenes: 1 title, 2 code, 1 text, 1 list, 1 outro");
  });

  it("prints every problem with its location", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cve-validate-"));
    const file = join(dir, "Bad_Name.yaml");
    await writeFile(
      file,
      [
        "title: Bad",
        "scenes:",
        "  - type: list",
        "    narration: Hi",
        "    items: [a, b, c, d, e]",
        "  - type: code",
        "    narration: Code",
        "    language: tsx",
        "    code: 'x'",
        "    highlight: [{ from: 1, to: 3 }]",
      ].join("\n"),
    );
    const r = await run(["validate", file]);
    await rm(dir, { recursive: true, force: true });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("is invalid (3 problems)");
    expect(r.stderr).toContain('(file name): "Bad_Name" must be kebab-case');
    expect(r.stderr).toContain("scenes[0].items: a list has at most 4 items");
    expect(r.stderr).toContain("scenes[1].highlight[0]: lines 1-3 are outside the code (1 lines)");
  });

  it("rejects an unknown provider before doing any work", async () => {
    const r = await run(["voice", EXAMPLE, "--provider", "nope"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Unknown provider "nope"');
  });
});

describe("loadDotEnv", () => {
  it("reads keys from a .env file without overriding the shell", async () => {
    const { loadDotEnv } = await import("../src/cli/env");
    const dir = await mkdtemp(join(tmpdir(), "cve-env-"));
    const file = join(dir, ".env");
    await writeFile(file, "CVE_TEST_FROM_FILE=file\nCVE_TEST_SHELL=file\n");
    process.env.CVE_TEST_SHELL = "shell";
    try {
      expect(loadDotEnv(file)).toBe(true);
      expect(process.env.CVE_TEST_FROM_FILE).toBe("file");
      expect(process.env.CVE_TEST_SHELL).toBe("shell");
      expect(loadDotEnv(join(dir, "missing.env"))).toBe(false);
    } finally {
      delete process.env.CVE_TEST_FROM_FILE;
      delete process.env.CVE_TEST_SHELL;
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("narration voice", () => {
  const voice = { gemini: "Puck", elevenlabs: "21m00Tcm4TlvDq8ikWAM" };

  it("is optional in the script, set per provider, and rejects unknown providers", () => {
    const base = { title: "T", scenes: [{ type: "title", heading: "H", narration: "Hi." }] };
    expect(parseScript(base).success).toBe(true);
    expect(parseScript({ ...base, voice }).success).toBe(true);
    expect(parseScript({ ...base, voice: { gemini: "" } })).toMatchObject({
      success: false,
      errors: ["voice.gemini: must not be empty"],
    });
    expect(parseScript({ ...base, voice: { openai: "alloy" } }).success).toBe(false);
  });

  it("picks the --voice flag, then the script, then the provider default", () => {
    expect(resolveVoice({ voice }, "gemini")).toBe("Puck");
    expect(resolveVoice({ voice }, "elevenlabs")).toBe("21m00Tcm4TlvDq8ikWAM");
    expect(resolveVoice({ voice }, "gemini", "Charon")).toBe("Charon");
    expect(resolveVoice({ voice }, "gemini", "  ")).toBe("Puck");
    expect(resolveVoice({}, "gemini")).toBeUndefined();
    expect(resolveVoice({ voice }, "mock", "Charon")).toBeUndefined();
  });

  it("passes the voice to every scene", async () => {
    const calls: (string | undefined)[] = [];
    const provider: TtsProvider = {
      name: "gemini",
      defaultVoiceId: "Kore",
      async synthesize(_text, options) {
        calls.push(options?.voiceId);
        return { path: "public/audio/x/a.wav", durationSeconds: 1, cached: false };
      },
    };
    const script = loadExample();
    await voiceScript(script, provider, silent, "public", "Puck");
    expect(calls).toEqual(script.scenes.map(() => "Puck"));
  });
});
