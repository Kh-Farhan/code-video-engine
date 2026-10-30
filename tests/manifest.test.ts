import { describe, expect, it } from "vitest";
import {
  parseManifest,
  totalDurationInFrames,
  type Manifest,
} from "../src/schema/manifest";

const manifest = (): Manifest => ({
  version: 1,
  slug: "example-usememo",
  title: "Example",
  fps: 30,
  scenes: [
    {
      scene: { type: "title", heading: "Hi", narration: "Hello world." },
      audio: "audio/example-usememo/0.mp3",
      durationInFrames: 60,
      captions: {
        granularity: "word",
        cues: [
          { text: "Hello", startFrame: 0, endFrame: 15 },
          { text: "world.", startFrame: 15, endFrame: 40 },
        ],
      },
    },
    {
      scene: { type: "outro", cta: "Follow", narration: "Bye." },
      audio: "audio/example-usememo/1.mp3",
      durationInFrames: 45,
      captions: { granularity: "sentence", cues: [] },
    },
  ],
});

describe("manifest schema", () => {
  it("accepts a valid manifest and sums durations", () => {
    const result = parseManifest(manifest());
    expect(result).toMatchObject({ success: true });
    expect(totalDurationInFrames(manifest())).toBe(105);
  });

  it("rejects cues that end after the scene", () => {
    const m = manifest();
    m.scenes[0]!.captions.cues[1]!.endFrame = 90;
    expect(parseManifest(m)).toEqual({
      success: false,
      errors: [
        "scenes[0].captions.cues[1].endFrame: ends at frame 90, after the scene (60 frames)",
      ],
    });
  });

  it("rejects cues with no length", () => {
    const m = manifest();
    m.scenes[0]!.captions.cues[0]!.endFrame = 0;
    const result = parseManifest(m);
    expect(result.success ? [] : result.errors).toEqual([
      "scenes[0].captions.cues[0]: `endFrame` must be greater than `startFrame`",
    ]);
  });

  it("rejects non kebab-case slugs", () => {
    const result = parseManifest({ ...manifest(), slug: "Example Usememo" });
    expect(result.success ? [] : result.errors).toEqual(["slug: must be kebab-case"]);
  });
});
