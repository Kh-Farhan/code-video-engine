import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadScriptFile } from "../src/cli/loadScript";
import { voiceContinuous } from "../src/cli/narration";
import { pipelinePaths } from "../src/cli/paths";
import type { Script } from "../src/schema/script";
import { sceneTransitionStyle } from "../src/scenes/animation";
import {
  fitTitleHeading,
  headingUnits,
  lineWidthEm,
  looksLikeCode,
  runsOf,
  TITLE_HEADING_FONT,
  TITLE_HEADING_MAX_LINES,
  titleHeadingBox,
  titleHeadingLayout,
} from "../src/scenes/titleHeading";
import { presets } from "../src/theme";
import { encodeWav, narrationAudio, trimLeadingSilence, type MonoPcm, type TtsProvider } from "../src/tts";

/** The first second of a Short: hook readable on frame 0, voice right away. */

const RATE = 8000;
const silent = { info: () => {} };

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

const scriptHeadings = (): { file: string; heading: string; subheading?: string }[] =>
  readdirSync("scripts")
    .filter((f) => f.endsWith(".yaml"))
    .flatMap((file) => {
      const result = loadScriptFile(join("scripts", file));
      if (!result.success) throw new Error(result.errors.join("\n"));
      const title = result.data.scenes.find((s) => s.type === "title");
      return title && title.type === "title" ? [{ file, heading: title.heading, subheading: title.subheading }] : [];
    });

const shown = (heading: string) =>
  runsOf(headingUnits(heading))
    .map((r) => (r.code ? `<${r.text}>` : r.text))
    .join("");

describe("title heading: code spans", () => {
  it("marks code in the heading and keeps prose plain", () => {
    expect(shown("[1, 2, 10].sort() gives [1, 10, 2]")).toBe("<[1, 2, 10].sort()> gives <[1, 10, 2]>");
    expect(shown("typeof null === 'object'")).toBe("<typeof null === 'object'>");
    expect(shown("Marked 'use client'. Crashed: window is not defined.")).toBe(
      "Marked <'use client'>. Crashed: window is not defined.",
    );
    expect(shown("Upgraded to Next.js 16. params.slug is undefined.")).toBe(
      "Upgraded to Next.js 16. <params.slug> is <undefined>.",
    );
    expect(shown("setTimeout 0 ran after the promise below it")).toBe("<setTimeout> 0 ran after the promise below it");
    expect(shown("It's const. user.name still changed.")).toBe("It's <const>. <user.name> still changed.");
    expect(shown("New user. Old draft still in the form.")).toBe("New user. Old draft still in the form.");
    expect(shown("You changed the env var. Nothing changed.")).toBe("You changed the env var. Nothing changed.");
  });

  it("treats backticks as explicit code and drops them", () => {
    expect(shown("`0.1 + 0.2` is not 0.3")).toBe("<0.1 + 0.2> is not 0.3");
  });

  it("does not take Next.js, DevTools or numbers for code", () => {
    for (const w of ["Next.js", "DevTools", "16", "3,", "It's"]) expect(looksLikeCode(w)).toBe(false);
  });

  it("measures code at the mono advance plus its pill", () => {
    const [unit] = headingUnits("user.name");
    expect(lineWidthEm([unit!])).toBeCloseTo(9 * 0.6 + 2 * 0.14, 5);
  });
});

describe("title heading: fit", () => {
  it("never breaks inside a code unit or before its punctuation", () => {
    const { lines } = fitTitleHeading({
      heading: "Upgraded to Next.js 16. params.slug is undefined.",
      maxWidth: 918,
      maxHeight: 700,
      maxLines: 3,
      minFontSize: 72,
      maxFontSize: 200,
    });
    const text = lines.map((l) => l.map((r) => r.text).join(""));
    expect(text.join(" ")).toBe("Upgraded to Next.js 16. params.slug is undefined.");
    for (const line of text) expect(line.startsWith(".")).toBe(false);
  });

  it("fills about 85% of the frame width in short, at most 3 lines, for every script", () => {
    const { maxWidth } = titleHeadingBox("short", true);
    expect(maxWidth).toBe(Math.round(0.85 * presets.short.width));
    const sizes: number[] = [];
    for (const { file, heading, subheading } of scriptHeadings()) {
      const layout = titleHeadingLayout(heading, "short", !!subheading);
      expect(layout.lines.length, file).toBeLessThanOrEqual(TITLE_HEADING_MAX_LINES);
      expect(layout.fontSize, file).toBeGreaterThanOrEqual(TITLE_HEADING_FONT.short.min);
      sizes.push(layout.fontSize);
      const widest = Math.max(...layout.lines.map((l) => lineWidthEm(headingUnits(l.map((r) => r.text).join("")))));
      // The widest line fills the box (or the text hit the size cap or the height limit).
      const width = widest * layout.fontSize;
      expect(width, file).toBeLessThanOrEqual(maxWidth * 1.001);
    }
    // Most hooks end up well above the old fixed 96px heading.
    const median = [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length / 2)]!;
    expect(median).toBeGreaterThan(presets.short.fontSize.heading * 1.2);
  });

  it("is bigger than the old fixed 96px heading", () => {
    expect(titleHeadingLayout("Your euro store says $29.99", "short", true).fontSize).toBeGreaterThan(150);
  });
});

describe("title scene: frame 0", () => {
  it("skips the zoom and blur in, so the heading is fully visible on the first frame", () => {
    const style = sceneTransitionStyle(0, 30, 90, false);
    expect(style.opacity).toBe(1);
    expect(style.filter).toBeUndefined();
    expect(sceneTransitionStyle(0, 30, 90).opacity).toBe(0);
  });
});

describe("narration: starts within 0.15s", () => {
  it("cuts leading silence down to the lead", () => {
    const pcm = signal(["silence", 900], ["tone", 300]);
    const result = trimLeadingSilence(pcm);
    expect(result.removedMs).toBeCloseTo(900 - narrationAudio.leadMs, -1);
    expect(result.startMs).toBeLessThanOrEqual(narrationAudio.maxStartMs);
  });

  it("leaves audio that already starts in time, and silent audio, alone", () => {
    const soon = signal(["silence", 100], ["tone", 300]);
    expect(trimLeadingSilence(soon).removedMs).toBe(0);
    const mock = signal(["silence", 500]);
    expect(trimLeadingSilence(mock)).toMatchObject({ removedMs: 0, startMs: 0 });
  });

  describe("voiceContinuous", () => {
    let root: string;
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "cve-first-second-"));
    });
    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it("puts the first word within 0.15s of frame 0 even when the provider leads with silence", async () => {
      const paths = pipelinePaths("lead", { publicDir: join(root, "public"), outRoot: join(root, "out") });
      await mkdir(paths.audioDir, { recursive: true });
      const provider: TtsProvider = {
        name: "elevenlabs",
        defaultVoiceId: "v",
        async synthesize(text) {
          const path = join(paths.audioDir, `lead-${text.length}.wav`);
          await writeFile(path, encodeWav(signal(["silence", 1200], ["tone", 400], ["silence", 300])));
          return { path, durationSeconds: 0, cached: false };
        },
      };
      const script: Pick<Script, "scenes"> = {
        scenes: [{ type: "title", heading: "H", narration: "Hook line." }] as Script["scenes"],
      };
      const track = await voiceContinuous(script, provider, silent, paths);
      expect(track.segments[0]!.startMs).toBeLessThanOrEqual(150);
    });
  });
});
