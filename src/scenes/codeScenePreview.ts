import type { CodeScene } from "../schema/script";
import { FPS, SCENE_PADDING_FRAMES } from "../theme";

/**
 * Studio preview data for CodeScene: the code scenes from
 * scripts/example-usememo.yaml, copied here because the Remotion bundle cannot
 * read files. tests/codeScenePreview.test.ts keeps them in sync with the YAML.
 */

/** Rough speaking rate, until the preview reads a real manifest. */
const WORDS_PER_SECOND = 2.5;

export const estimatePreviewFrames = (narration: string): number =>
  Math.ceil((narration.split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND) * FPS) +
  SCENE_PADDING_FRAMES;

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
        { from: 2, to: 2 },
        { from: 3, to: 3 },
      ],
      narration:
        "Case one: cheap calculations. Reading a length or building a short string costs almost nothing. The memo adds a dependency check and extra memory on every render, so you pay more than you save.",
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
        { from: 2, to: 2 },
        { from: 3, to: 3 },
      ],
      narration:
        "Case two: values passed to plain DOM elements. A div does not care whether the style object is the same reference, so memoizing it buys you nothing.",
    },
  },
} satisfies Record<string, { filename: string; scene: CodeScene }>;
