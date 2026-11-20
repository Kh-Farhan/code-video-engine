import type { CodeLanguage, Scene, SceneMood } from "../../schema/script";
import { stripPauseMarkers } from "../../schema/pauses";
import { compareRevealFrames } from "../../scenes/timing";

/** One scene as the looks see it: where it sits in the video and how it feels. */
export type LookScene = {
  type: Scene["type"];
  /** First frame of the scene, from the start of the video. */
  start: number;
  durationInFrames: number;
  /** Editor tab label. */
  filename: string;
  /** Mood changes inside the scene, in video frames, first one at `start`. */
  moods: { frame: number; mood: SceneMood }[];
};

const extensions: Record<CodeLanguage, string> = {
  typescript: "index.ts",
  tsx: "app.tsx",
  javascript: "script.js",
  jsx: "App.jsx",
  json: "data.json",
  css: "styles.css",
  html: "index.html",
  bash: "run.sh",
  python: "main.py",
  go: "main.go",
  rust: "main.rs",
  sql: "query.sql",
  yaml: "config.yaml",
};

/** Editor tab name for a code language, e.g. tsx gives app.tsx. */
export const filenameForLanguage = (language: CodeLanguage): string =>
  extensions[language];

/** Editor tab name for any scene: the file for code, a fitting name for the rest. */
export const sceneFilename = (scene: Scene): string => {
  switch (scene.type) {
    case "code":
      return filenameForLanguage(scene.language);
    case "compare":
      return scene.language ? `${filenameForLanguage(scene.language)} (diff)` : "compare.md";
    case "output":
      return scene.title ?? "Terminal";
    case "title":
      return "README.md";
    case "outro":
      return "next.md";
    case "stat":
      return "stats.json";
    case "flow":
      return "flow.md";
    case "list":
      return "notes.md";
    case "keyword":
    case "text":
      return "notes.md";
  }
};

const BUG_WORDS = /\b(bugs?|buggy|wrong|breaks?|broken|stale|crash(?:es)?|leaks?)\b/i;
const FIX_WORDS = /\b(fix(?:es|ed)?|instead|solution|correctly)\b/i;

/**
 * Mood changes of a scene, as fractions of its length. An explicit `mood`
 * wins; a compare scene goes bug then fix when its right side lands; other
 * scenes follow the first bug or fix word in their narration, switching
 * where the other kind of word comes up (by its position in the text).
 */
export const sceneMoodSteps = (
  scene: Scene,
  durationInFrames: number,
  fps: number,
): { at: number; mood: SceneMood }[] => {
  if (scene.mood) return [{ at: 0, mood: scene.mood }];
  if (scene.type === "compare") {
    const { right } = compareRevealFrames(durationInFrames, fps);
    return [
      { at: 0, mood: "bug" },
      { at: right, mood: "fix" },
    ];
  }
  if (scene.type === "outro") return [{ at: 0, mood: "accent" }];
  const text = stripPauseMarkers(scene.narration);
  const bug = text.search(BUG_WORDS);
  const fix = text.search(FIX_WORDS);
  if (bug < 0 && fix < 0) return [{ at: 0, mood: "accent" }];
  if (fix < 0) return [{ at: 0, mood: "bug" }];
  if (bug < 0) return [{ at: 0, mood: "fix" }];
  const [second, firstMood, secondMood]: [number, SceneMood, SceneMood] =
    bug < fix ? [fix, "bug", "fix"] : [bug, "fix", "bug"];
  return [
    { at: 0, mood: firstMood },
    { at: Math.round((second / Math.max(1, text.length)) * durationInFrames), mood: secondMood },
  ];
};

/** Lays the manifest scenes end to end and works out each one's tab and moods. */
export const lookTimeline = (
  scenes: readonly { scene: Scene; durationInFrames: number }[],
  fps: number,
): LookScene[] => {
  let start = 0;
  return scenes.map(({ scene, durationInFrames }) => {
    const entry: LookScene = {
      type: scene.type,
      start,
      durationInFrames,
      filename: sceneFilename(scene),
      moods: sceneMoodSteps(scene, durationInFrames, fps).map((m) => ({
        frame: start + m.at,
        mood: m.mood,
      })),
    };
    start += durationInFrames;
    return entry;
  });
};

/** Every mood change in the video, in order. Empty timeline: calm accent throughout. */
export const moodChanges = (timeline: readonly LookScene[]): { frame: number; mood: SceneMood }[] => {
  const all = timeline.flatMap((s) => s.moods);
  return all.length > 0 ? all : [{ frame: 0, mood: "accent" }];
};

/**
 * Mood at `frame` as a blend: the previous mood, the current one, and how far
 * the crossfade between them has got (0 to 1 over `fadeFrames`).
 */
export const moodAt = (
  changes: readonly { frame: number; mood: SceneMood }[],
  frame: number,
  fadeFrames: number,
): { from: SceneMood; to: SceneMood; t: number } => {
  let index = 0;
  for (let i = 0; i < changes.length; i++) if ((changes[i]?.frame ?? 0) <= frame) index = i;
  const current = changes[index] ?? { frame: 0, mood: "accent" as const };
  const previous = index > 0 ? (changes[index - 1]?.mood ?? current.mood) : current.mood;
  const t = fadeFrames <= 0 ? 1 : Math.min(1, Math.max(0, (frame - current.frame) / fadeFrames));
  return { from: previous, to: current.mood, t };
};

/** Index of the scene playing at `frame` (the last one past the end). */
export const sceneIndexAt = (timeline: readonly LookScene[], frame: number): number => {
  let index = 0;
  for (let i = 0; i < timeline.length; i++) if ((timeline[i]?.start ?? 0) <= frame) index = i;
  return index;
};
