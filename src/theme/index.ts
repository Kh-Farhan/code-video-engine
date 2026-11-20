/**
 * Theme: timing, aspect-ratio presets, colors, fonts, spacing.
 * Pure data, safe to import from Node (CLI, tests) and from components.
 * Font loading for the browser lives in ./fonts.ts.
 */

export const FPS = 30;

export const secondsToFrames = (seconds: number): number =>
  Math.round(seconds * FPS);

/**
 * Silence added after each scene's audio before the next scene starts. Only
 * used with --per-scene-audio; continuous narration has no padding.
 */
export const SCENE_PADDING_SECONDS = 0.4;
export const SCENE_PADDING_FRAMES = secondsToFrames(SCENE_PADDING_SECONDS);

/** Continuous narration: how long the video runs on after the last spoken word. */
export const NARRATION_TAIL_SECONDS = 0.6;

/** Look and caption style used when the script does not set them. */
export const DEFAULT_LOOK = "grid" as const;
export const DEFAULT_CAPTION_STYLE = "pop" as const;

/** Background music levels used when the script does not set them (0 to 1). */
export const MUSIC_VOLUME = 0.3;
export const MUSIC_DUCKED_VOLUME = 0.08;

/** How background music moves, in seconds. Converted to frames at the manifest fps. */
export const musicTiming = {
  /** Ramp down before narration starts. */
  attack: 0.25,
  /** Ramp back up after narration stops. */
  release: 0.6,
  /** Pauses shorter than this stay ducked, so the music does not pump between scenes. */
  hold: 1,
  /** Fade in at the start of the video. */
  fadeIn: 1,
  /** Fade out at the end of the video. */
  fadeOut: 1.5,
} as const;

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

/**
 * Brand tokens: the channel's identity, shared by every look. One signature
 * accent (the amber of the spoken caption word), red for the bug, green for
 * the fix, and a neutral base everything dark is built on.
 */
export const brand = {
  /** Signature accent: active caption words, cursors, tabs, the FG mark. */
  accent: "#ffd43b",
  /** The bug: wrong code, broken output, the surprise in a hook. */
  bug: "#ff6b6b",
  /** The fix: right code, the answer. */
  fix: "#51cf66",
  /** Neutral base: backgrounds, panels and cards are shades of it. */
  base: "#0b0f17",
  /** Wordmark text. */
  name: "Frontend Gotchas",
  /** Short mark for small spaces. */
  mark: "FG",
} as const;

/** Dark palette tuned for code on screen. */
export const colors = {
  background: brand.base,
  surface: "#121826",
  surfaceRaised: "#1a2233",
  border: "#2a3447",
  text: "#e6edf3",
  /** Hook headings: the highest contrast on the dark backdrop. */
  textStrong: "#ffffff",
  textMuted: "#8b98ad",
  accent: "#7aa2f7",
  accentAlt: "#bb9af7",
  /** The brand accent (amber), for chrome that should read as the channel. */
  brandAccent: brand.accent,
  success: brand.fix,
  warning: "#e0af68",
  danger: brand.bug,
  /** The spoken word in "pop" captions: bright enough to read over any backdrop. */
  captionHighlight: brand.accent,
  /** Background behind highlighted code lines. */
  highlight: "rgba(122, 162, 247, 0.16)",
  /** Opacity applied to code lines outside the current highlight. */
  dimOpacity: 0.35,
} as const;

/**
 * Per-look colors, all derived from `brand`. Every value is checked for
 * contrast against white text, caption words and code in tests/looks.test.ts.
 */
export const lookColors = {
  /** Background moods for aurora (and the editor's drift): blob colors per mood. */
  moods: {
    accent: [brand.accent, "#f08c00", "#7aa2f7"],
    bug: [brand.bug, "#f08c00", "#c92a2a"],
    fix: [brand.fix, "#20c997", "#2f9e44"],
  },
  /**
   * Flat saturated scene colors for `blocks`, each a deep shade of a brand
   * token so white text, the amber caption word and red/green marks stay
   * readable on it. Calm scenes cycle through `accent`; bug and fix moments
   * take their own color.
   */
  blocks: {
    /** Saturated shades of the base (navy) and the accent (amber). */
    accent: ["#1c3faa", "#7a3100"],
    bug: ["#9b1c2c"],
    fix: ["#0b5c3a"],
  },
} as const;

export type Mood = keyof typeof lookColors.moods;

/** WCAG relative luminance of "#rrggbb". */
export const luminance = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};

/** WCAG contrast ratio between two "#rrggbb" colors, 1 to 21. */
export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Linear blend of two "#rrggbb" colors, t from 0 (a) to 1 (b). */
export const mixHex = (a: string, b: string, t: number): string => {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const k = Math.min(1, Math.max(0, t));
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - k) + ((pb >> shift) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
};

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

/** Insets from each frame edge, in px. */
export type Insets = { top: number; right: number; bottom: number; left: number };

/**
 * Platform safe area: the part of the frame no app UI draws over. Captions
 * and key visuals stay inside it.
 *
 * `short` defaults are conservative across YouTube Shorts, Instagram Reels and
 * TikTok at 1080x1920 (each app's overlay is smaller than this on its own):
 * - bottom 480 (25%): title, description, music and caption UI
 * - right 144: like, comment, share and remix buttons
 * - top 192 (10%): status bar, search, tabs and the Reels header
 * - left 64: a small margin; no app puts buttons on the left
 *
 * `long` (16:9 YouTube) has no permanent overlays, so it only uses the preset
 * padding. Edit these values to retune every layout that depends on them.
 */
export const platformSafeArea: Record<PresetName, Insets> = {
  short: { top: 192, right: 144, bottom: 480, left: 64 },
  long: { top: 0, right: 0, bottom: 0, left: 0 },
};
