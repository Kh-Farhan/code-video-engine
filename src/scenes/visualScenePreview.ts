import type { Manifest } from "../schema/manifest";
import type {
  CompareScene,
  FlowScene,
  KeywordScene,
  OutputScene,
  Scene,
  StatScene,
} from "../schema/script";
import { FPS, SCENE_PADDING_FRAMES } from "../theme";
import { estimatePreviewFrames } from "./codeScenePreview";

/**
 * Studio preview data for the visual scene types (compare, keyword, output,
 * flow, stat). Each preview is a one-scene manifest rendered by
 * ExplainerVideo with captions on, so the caption band shows below the visual.
 */
export const previewVisualScenes = {
  "compare-code": {
    type: "compare",
    language: "tsx",
    wrong: { code: "items.map((item, i) => (\n  <Row key={i} item={item} />\n))" },
    right: { code: "items.map((item) => (\n  <Row key={item.id} item={item} />\n))" },
    narration:
      "Using the index as a key ties state to a position. Use a stable ID from the data instead.",
  } satisfies CompareScene,
  "compare-label": {
    type: "compare",
    wrong: { label: "key={index}" },
    right: { label: "key={item.id}" },
    narration: "An index key moves with the list. A stable ID stays with the item.",
  } satisfies CompareScene,
  keyword: {
    type: "keyword",
    keyword: "STABLE ID",
    narration: "So whenever a list can reorder, give every row an identity that travels with it.",
  } satisfies KeywordScene,
  output: {
    type: "output",
    command: "node loop.js",
    lines: ["[1, 10, 2]", "[1, 2, 10]"],
    narration:
      "The default sort compares strings, so ten lands before two. Pass a compare function and the numbers come out right.",
  } satisfies OutputScene,
  flow: {
    type: "flow",
    steps: ["Server render", "Send HTML", "Hydrate", "Interactive"],
    narration:
      "The server renders HTML, sends it down, and then React hydrates it in the browser. Only then do clicks work.",
  } satisfies FlowScene,
  stat: {
    type: "stat",
    from: "+1",
    value: "+3",
    label: "count after three quick clicks",
    narration:
      "With the updater function every click counts, so three quick clicks add three instead of one.",
  } satisfies StatScene,
} satisfies Record<string, Scene>;

export type VisualPreviewName = keyof typeof previewVisualScenes;

/** A one-scene manifest for a visual scene preview, with rough sentence captions. */
export const visualSceneManifest = (name: VisualPreviewName): Manifest => {
  const scene: Scene = previewVisualScenes[name];
  const durationInFrames = estimatePreviewFrames(scene.narration);
  return {
    version: 1,
    slug: `preview-${name}`,
    title: `Preview: ${name}`,
    fps: FPS,
    scenes: [
      {
        scene,
        audio: `audio/preview/${name}.mp3`,
        durationInFrames,
        captions: {
          granularity: "sentence",
          cues: [
            {
              text: scene.narration,
              startFrame: 0,
              endFrame: durationInFrames - SCENE_PADDING_FRAMES,
            },
          ],
        },
      },
    ],
  };
};
