import type { CodeScene } from "../schema/script";
import { sceneWordTimings } from "../captions/scene";
import type { TimedWord } from "../captions/types";
import { FPS, SCENE_PADDING_FRAMES } from "../theme";

/**
 * Studio preview data for CodeScene: the code scenes from
 * scripts/example-usememo.yaml, copied here because the Remotion bundle cannot
 * read files. tests/codeLayout.test.ts keeps them in sync with the YAML.
 */

/** Rough speaking rate, until the preview reads a real manifest. */
const WORDS_PER_SECOND = 2.5;

export const estimatePreviewFrames = (narration: string): number =>
  Math.ceil((narration.split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND) * FPS) +
  SCENE_PADDING_FRAMES;

/**
 * Estimated word timings for a preview scene, so cued highlight steps start
 * on their word in Studio the same way they do in a rendered video.
 */
export const previewWordTimings = (narration: string, durationInFrames: number): TimedWord[] =>
  sceneWordTimings({ narration, audioDurationInFrames: Math.max(1, durationInFrames - SCENE_PADDING_FRAMES) });

export const previewCodeScenes = {
  highlight: {
    filename: "Cart.tsx",
    scene: {
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
        { from: 2, to: 2, cue: "length" },
        { from: 3, to: 3, cue: "string" },
      ],
      narration:
        "One: cheap work. A length or a short string costs nothing, but the memo still runs a dependency check every render.",
    },
  },
  typing: {
    filename: "Profile.tsx",
    scene: {
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
        { from: 2, to: 2, cue: "style" },
        { from: 3, to: 3, cue: "div" },
      ],
      narration:
        "Two: a memoized style object passed to a plain div. DOM elements never compare references, so it buys nothing.",
    },
  },
} satisfies Record<string, { filename: string; scene: CodeScene }>;
