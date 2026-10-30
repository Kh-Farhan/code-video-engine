import { describe, expect, it } from "vitest";
import { parseManifest, totalDurationInFrames } from "../src/schema/manifest";
import { calculateExplainerMetadata } from "../src/scenes/explainerMetadata";
import {
  sampleManifest,
  singleSceneManifest,
} from "../src/scenes/fixtures/sampleManifest";
import { listRevealFrames, videoProgress } from "../src/scenes/timing";

const metadata = (props: Parameters<typeof calculateExplainerMetadata>[0]["props"]) =>
  calculateExplainerMetadata({
    props,
    defaultProps: props,
    abortSignal: new AbortController().signal,
    compositionId: "test",
    isRendering: false,
  });

describe("listRevealFrames", () => {
  it("reveals items in order, spread across the scene", () => {
    const frames = listRevealFrames(4, 300, 30);
    expect(frames).toHaveLength(4);
    expect(frames[0]).toBe(9);
    expect(frames[3]).toBe(210);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!).toBeGreaterThan(frames[i - 1]!);
    }
  });

  it("handles one item and very short scenes", () => {
    expect(listRevealFrames(1, 300, 30)).toEqual([9]);
    const short = listRevealFrames(3, 8, 30);
    expect(short.every((f) => f >= 0 && f < 8)).toBe(true);
    expect(listRevealFrames(0, 300, 30)).toEqual([]);
  });
});

describe("videoProgress", () => {
  it("goes from 0 on the first frame to 1 on the last", () => {
    expect(videoProgress(0, 100)).toBe(0);
    expect(videoProgress(99, 100)).toBe(1);
    expect(videoProgress(0, 1)).toBe(1);
  });
});

describe("sample manifest fixture", () => {
  it("is a valid manifest with every scene type", () => {
    expect(parseManifest(sampleManifest)).toMatchObject({ success: true });
    expect(new Set(sampleManifest.scenes.map((s) => s.scene.type)).size).toBe(5);
    expect(sampleManifest.scenes).toHaveLength(6);
  });

  it("slices into valid single-scene manifests", () => {
    sampleManifest.scenes.forEach((_, i) => {
      const one = singleSceneManifest(i);
      expect(one.scenes).toHaveLength(1);
      expect(parseManifest(one)).toMatchObject({ success: true });
    });
  });
});

describe("calculateExplainerMetadata", () => {
  it("takes duration and fps from the manifest and size from the preset", async () => {
    const short = await metadata({ manifest: sampleManifest, preset: "short" });
    expect(short).toMatchObject({
      durationInFrames: totalDurationInFrames(sampleManifest),
      fps: 30,
      width: 1080,
      height: 1920,
      defaultOutName: "example-usememo-short",
    });
    const long = await metadata({ manifest: sampleManifest, preset: "long" });
    expect(long).toMatchObject({ width: 1920, height: 1080 });
  });

  it("follows the manifest fps and scene lengths", async () => {
    const manifest = {
      ...sampleManifest,
      fps: 60,
      scenes: sampleManifest.scenes.slice(0, 2).map((s) => ({ ...s, durationInFrames: 400 })),
    };
    expect(await metadata({ manifest, preset: "long" })).toMatchObject({
      durationInFrames: 800,
      fps: 60,
    });
  });

  it("throws with schema errors on an invalid manifest", () => {
    const manifest = { ...sampleManifest, scenes: [] };
    expect(() => metadata({ manifest, preset: "short" })).toThrow(/Invalid manifest/);
  });
});

describe("calculateExplainerMetadata preset check", () => {
  it("throws a clear error on an unknown preset", () => {
    const props = { manifest: sampleManifest, preset: "Short" as "short" };
    expect(() => metadata(props)).toThrow(/Invalid preset "Short"/);
  });
});
