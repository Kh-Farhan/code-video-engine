import type { Manifest, ManifestMusic, ManifestScene } from "../../schema/manifest";
import type { Scene } from "../../schema/script";
import { FPS, MUSIC_DUCKED_VOLUME, MUSIC_VOLUME, SCENE_PADDING_FRAMES } from "../../theme";

/**
 * Studio preview fixture mirroring scripts/example-usememo.yaml.
 * Durations are rough estimates (about 2.6 words per second plus padding)
 * and the audio files do not exist, so render it with `withAudio: false`.
 */

const SLUG = "example-usememo";

const entry = (index: number, scene: Scene, durationInFrames: number): ManifestScene => ({
  scene,
  audio: `audio/${SLUG}/${index}.mp3`,
  durationInFrames,
  captions: {
    granularity: "sentence",
    cues: [{ text: scene.narration, startFrame: 0, endFrame: durationInFrames - SCENE_PADDING_FRAMES }],
  },
});

const scenes: Scene[] = [
  {
    type: "title",
    heading: "Stop wrapping everything in useMemo",
    subheading: "Three cases where it makes React slower, not faster",
    narration:
      "You probably use useMemo more than you need to. Here is when it actually hurts.",
  },
  {
    type: "code",
    language: "tsx",
    code: [
      "function Cart({ items }) {",
      "  const count = useMemo(() => items.length, [items]);",
      "  const label = useMemo(() => `${count} items`, [count]);",
      "  return <Badge>{label}</Badge>;",
      "}",
      "",
    ].join("\n"),
    highlight: [
      { from: 2, to: 2 },
      { from: 3, to: 3 },
    ],
    narration:
      "Case one: cheap calculations. Reading a length or building a short string costs almost nothing. The memo adds a dependency check and extra memory on every render, so you pay more than you save.",
  },
  {
    type: "code",
    language: "tsx",
    typing: true,
    code: [
      "function Profile({ user }) {",
      "  const style = useMemo(() => ({ color: user.color }), [user]);",
      "  return <div style={style}>{user.name}</div>;",
      "}",
      "",
    ].join("\n"),
    highlight: [
      { from: 2, to: 2 },
      { from: 3, to: 3 },
    ],
    narration:
      "Case two: values passed to plain DOM elements. A div does not care whether the style object is the same reference, so memoizing it buys you nothing.",
  },
  {
    type: "text",
    text: "Case three, the dependencies change every render. Then the memo never hits.",
    narration:
      "Case three: if a dependency is a new object or function on every render, the cache misses every single time. You get all of the cost and none of the benefit.",
  },
  {
    type: "list",
    items: [
      "The calculation is measurably slow",
      "The value goes to a memoized child",
      "The value is a dependency of another hook",
    ],
    narration:
      "So when should you use it? When the calculation is measurably slow, when the value goes to a memoized child, or when it is a dependency of another hook.",
  },
  {
    type: "outro",
    cta: "Profile first, then memoize",
    narration:
      "Measure before you memoize. Follow for more React tips that keep your code simple.",
  },
];

const durations = [135, 315, 225, 255, 255, 165];

export const sampleManifest: Manifest = {
  version: 1,
  slug: SLUG,
  title: "When NOT to use useMemo",
  fps: FPS,
  scenes: scenes.map((scene, i) => entry(i, scene, durations[i] ?? 150)),
};

/** The sample manifest reduced to one scene, for per-scene Studio previews. */
export const singleSceneManifest = (index: number): Manifest => ({
  ...sampleManifest,
  scenes: sampleManifest.scenes.slice(index, index + 1),
});

/**
 * Music settings for the ducking preview. The file is not in the repo, which
 * is fine: the preview only plots the volume curve.
 */
export const sampleMusic: ManifestMusic = {
  src: "music/example.mp3",
  volume: MUSIC_VOLUME,
  duckedVolume: MUSIC_DUCKED_VOLUME,
};
