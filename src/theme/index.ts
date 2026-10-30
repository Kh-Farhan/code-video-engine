/**
 * Theme: timing, aspect-ratio presets, colors, fonts, spacing.
 * Pure data, safe to import from Node (CLI, tests) and from components.
 * Font loading for the browser lives in ./fonts.ts.
 */

export const FPS = 30;

/** Silence added after each scene's audio before the next scene starts. */
export const SCENE_PADDING_FRAMES = 15;

export const secondsToFrames = (seconds: number): number =>
  Math.round(seconds * FPS);

export const presetNames = ["short", "long"] as const;
export type PresetName = (typeof presetNames)[number];

export type Preset = {
  name: PresetName;
  width: number;
  height: number;
  /** Outer padding around scene content, in px. */
  padding: number;
  fontSize: {
    heading: number;
    subheading: number;
    /** Body text. Never below 48 in `short` so it stays readable on a phone. */
    body: number;
    code: number;
    caption: number;
  };
};

export const presets: Record<PresetName, Preset> = {
  short: {
    name: "short",
    width: 1080,
    height: 1920,
    padding: 72,
    fontSize: { heading: 96, subheading: 56, body: 56, code: 40, caption: 52 },
  },
  long: {
    name: "long",
    width: 1920,
    height: 1080,
    padding: 120,
    fontSize: { heading: 104, subheading: 52, body: 52, code: 36, caption: 44 },
  },
};

/** Dark palette tuned for code on screen. */
export const colors = {
  background: "#0b0f17",
  surface: "#121826",
  surfaceRaised: "#1a2233",
  border: "#2a3447",
  text: "#e6edf3",
  textMuted: "#8b98ad",
  accent: "#7aa2f7",
  accentAlt: "#bb9af7",
  success: "#9ece6a",
  warning: "#e0af68",
  danger: "#f7768e",
  /** Background behind highlighted code lines. */
  highlight: "rgba(122, 162, 247, 0.16)",
  /** Opacity applied to code lines outside the current highlight. */
  dimOpacity: 0.35,
} as const;

/** Shiki theme id that matches the palette above. */
export const codeTheme = "tokyo-night";

export const fonts = {
  sans: '"Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export const spacing = {
  xs: 8,
  sm: 16,
  md: 32,
  lg: 48,
  xl: 80,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
} as const;
