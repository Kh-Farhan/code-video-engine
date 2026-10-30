import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { buildManifest, resolveMusic } from "../src/cli/manifest";
import {
  bridgeShortPauses,
  duckAmount,
  musicVolumeAt,
  narrationWindows,
} from "../src/components/musicDucking";
import { sampleManifest } from "../src/scenes/fixtures/sampleManifest";
import { parseManifest, totalDurationInFrames } from "../src/schema/manifest";
import { parseScript, type Script } from "../src/schema/script";
import { MUSIC_DUCKED_VOLUME, MUSIC_VOLUME } from "../src/theme";

const script = (music?: unknown): unknown => ({
  title: "Test",
  ...(music === undefined ? {} : { music }),
  scenes: [
    { type: "title", heading: "Hello", narration: "Hello there, friend." },
    { type: "text", text: "Short.", narration: "Something short and sweet." },
  ],
});

const errorsFor = (input: unknown): string[] => {
  const result = parseScript(input);
  if (result.success) throw new Error("expected script to be invalid");
  return result.errors;
};

describe("music in the script", () => {
  it("is optional", () => {
    expect(parseScript(script()).success).toBe(true);
  });

  it("accepts a file under public/ with optional levels", () => {
    expect(parseScript(script({ file: "music/lofi.mp3" })).success).toBe(true);
    expect(
      parseScript(script({ file: "music/lofi.wav", volume: 0.4, duckedVolume: 0.1 })).success,
    ).toBe(true);
  });

  it("rejects paths outside public/, unknown formats, and bad levels", () => {
    expect(errorsFor(script({ file: "../secret.mp3" }))).toContain(
      "music.file: must be a path inside public/, e.g. music/lofi.mp3",
    );
    expect(errorsFor(script({ file: "/abs/song.mp3" }))[0]).toMatch(/^music\.file: must be a path/);
    expect(errorsFor(script({ file: "music/song.flac" }))[0]).toMatch(/^music\.file: must be one of/);
    expect(errorsFor(script({ file: "a.mp3", volume: 1.5 }))).toContain(
      "music.volume: must be between 0 and 1",
    );
    expect(errorsFor(script({ file: "a.mp3", volume: 0.2, duckedVolume: 0.5 }))).toContain(
      "music.duckedVolume: must not be louder than `volume`",
    );
    expect(errorsFor(script({ file: "a.mp3", loud: true }))[0]).toMatch(/^music: /);
  });
});

describe("music in the manifest", () => {
  it("fills in default levels", () => {
    expect(resolveMusic({ file: "music/a.mp3" })).toEqual({
      src: "music/a.mp3",
      volume: MUSIC_VOLUME,
      duckedVolume: MUSIC_DUCKED_VOLUME,
    });
    // A quiet track never gets louder under narration.
    expect(resolveMusic({ file: "a.mp3", volume: 0.05 }).duckedVolume).toBe(0.05);
  });

  it("is carried into the built manifest only when the script has it", () => {
    const parsed = parseScript(script({ file: "music/a.mp3", volume: 0.5 }));
    if (!parsed.success) throw new Error(parsed.errors.join("\n"));
    const audio = [
      { audio: "audio/t/0.wav", durationSeconds: 1 },
      { audio: "audio/t/1.wav", durationSeconds: 1.5 },
    ];
    const withMusic = buildManifest(parsed.data, "t", audio);
    expect(withMusic.music).toEqual({ src: "music/a.mp3", volume: 0.5, duckedVolume: 0.08 });
    expect(parseManifest(withMusic).success).toBe(true);

    const { music: _, ...noMusic } = parsed.data;
    expect(buildManifest(noMusic as Script, "t", audio).music).toBeUndefined();
  });
});

describe("ducking", () => {
  const windows = narrationWindows(sampleManifest);
  const durationInFrames = totalDurationInFrames(sampleManifest);
  const input = { windows, volume: 0.3, duckedVolume: 0.08, durationInFrames, fps: 30 };

  it("finds one narration window per scene, on the video timeline", () => {
    expect(windows).toHaveLength(sampleManifest.scenes.length);
    let offset = 0;
    sampleManifest.scenes.forEach((s, i) => {
      expect(windows[i]!.startFrame).toBe(offset);
      expect(windows[i]!.endFrame).toBe(offset + s.captions.cues.at(-1)!.endFrame);
      offset += s.durationInFrames;
    });
  });

  it("is fully ducked while narration speaks and released in long pauses", () => {
    const w = [{ startFrame: 100, endFrame: 200 }];
    expect(duckAmount(150, w, 30)).toBe(1);
    expect(duckAmount(0, w, 30)).toBe(0);
    expect(duckAmount(400, w, 30)).toBe(0);
    // Ramps down just before speech and back up just after.
    expect(duckAmount(96, w, 30)).toBeGreaterThan(0);
    expect(duckAmount(96, w, 30)).toBeLessThan(1);
    expect(duckAmount(205, w, 30)).toBeGreaterThan(0);
    expect(duckAmount(205, w, 30)).toBeLessThan(1);
  });

  it("stays ducked through short pauses between scenes", () => {
    expect(
      bridgeShortPauses(
        [
          { startFrame: 0, endFrame: 100 },
          { startFrame: 112, endFrame: 200 },
          { startFrame: 300, endFrame: 400 },
        ],
        30,
      ),
    ).toEqual([
      { startFrame: 0, endFrame: 200 },
      { startFrame: 300, endFrame: 400 },
    ]);
    // The sample manifest pads scenes by 0.4s, so narration never lets go.
    for (let f = windows[0]!.startFrame; f < windows.at(-1)!.endFrame; f++) {
      expect(duckAmount(f, windows, 30)).toBe(1);
    }
    // A 2 second pause does let the music come back up.
    const w = [
      { startFrame: 0, endFrame: 100 },
      { startFrame: 160, endFrame: 200 },
    ];
    expect(duckAmount(130, w, 30)).toBe(0);
  });

  it("ramps smoothly, without jumps between frames", () => {
    let previous = musicVolumeAt(0, input);
    for (let f = 1; f < durationInFrames; f++) {
      const v = musicVolumeAt(f, input);
      expect(Math.abs(v - previous)).toBeLessThan(0.05);
      previous = v;
    }
  });

  it("sits at the ducked level under narration and fades at both ends", () => {
    expect(musicVolumeAt(0, input)).toBe(0);
    expect(musicVolumeAt(durationInFrames - 1, input)).toBe(0);
    const mid = windows[2]!;
    expect(musicVolumeAt((mid.startFrame + mid.endFrame) >> 1, input)).toBeCloseTo(0.08);
  });

  it("is deterministic", () => {
    expect(musicVolumeAt(123, input)).toBe(musicVolumeAt(123, input));
  });
});

describe("pnpm video validate with music", () => {
  it("reports a music file that does not exist in public/", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cve-music-"));
    const file = join(dir, "with-music.yaml");
    await writeFile(
      file,
      [
        "title: Music",
        "music:",
        "  file: music/does-not-exist.mp3",
        "scenes:",
        "  - type: title",
        "    heading: Hi",
        "    narration: Hello there.",
      ].join("\n"),
    );
    const r = await promisify(execFile)(process.execPath, [
      "--import",
      "tsx",
      "src/cli/index.ts",
      "validate",
      file,
    ]).then(
      () => ({ code: 0, stderr: "" }),
      (e: { code: number; stderr: string }) => e,
    );
    await rm(dir, { recursive: true, force: true });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(
      "music.file: public/music/does-not-exist.mp3 does not exist (paths are relative to public/)",
    );
  });
});
