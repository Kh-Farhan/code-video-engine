import type { CaptionStyleName } from "../schema/script";
import { platformSafeArea, presets, spacing, type Insets, type PresetName } from "../theme";
import { measureInterBold } from "../thumbnail/interMetrics";
import type { ChunkOptions } from "./chunk";

/**
 * Frame layout shared by captions and scenes. Each frame is split into:
 * - a visual zone (code and graphics), and
 * - a caption band below it.
 * The two never overlap, and both stay inside the platform safe area
 * (`platformSafeArea` in src/theme), so neither captions nor visuals sit
 * under app UI and captions never cover code.
 */

/** A box in frame pixels. */
export type Rect = { top: number; left: number; width: number; height: number };

/** Caption line height, as a multiple of the caption font size. */
export const CAPTION_LINE_HEIGHT = 1.1;
/** Vertical padding inside the caption box ("box" style), in px. */
export const CAPTION_BOX_PADDING_Y = spacing.sm;
/** Line height of the "box" style, which reads like subtitles. */
export const BOX_LINE_HEIGHT = 1.2;


/**
 * "pop" captions are the main text viewers read, so they are big: about 9%
 * of the frame width in `short`.
 */
export const POP_FONT_SIZE: Record<PresetName, number> = { short: 100, long: 68 };
/** Never shrink a long word below this, so it stays readable on a phone. */
export const POP_MIN_FONT_SIZE: Record<PresetName, number> = { short: 60, long: 44 };

/** Lines a caption may wrap to, per preset. 1 to 3 words fit one line in 16:9. */
export const CAPTION_MAX_LINES: Record<PresetName, number> = { short: 2, long: 2 };

export const captionFontSize = (preset: PresetName, style: CaptionStyleName): number =>
  style === "pop" ? POP_FONT_SIZE[preset] : presets[preset].fontSize.caption;

/** Words on screen at once in the "box" style. "pop" uses TikTok-style pages instead. */
export const captionChunkOptions: { box: ChunkOptions } = {
  box: { minWords: 3, maxWords: 6 },
};

/** Gap between the visual zone and the caption band, in px. */
export const ZONE_GAP = spacing.md;

/** Vertical center of the caption band in `long`: the middle of the lower third. */
const LONG_BAND_CENTER_Y = 5 / 6;
/** Width share of the frame captions may use in `long`. */
const LONG_BAND_WIDTH = 0.8;

/** Height the caption band needs to fit either style at its largest. */
export const captionBandHeight = (preset: PresetName): number => {
  const lines = CAPTION_MAX_LINES[preset];
  const pop = lines * POP_FONT_SIZE[preset] * CAPTION_LINE_HEIGHT * POP_WORD_MAX_SCALE;
  const box =
    lines * captionFontSize(preset, "box") * BOX_LINE_HEIGHT + 2 * CAPTION_BOX_PADDING_Y;
  return Math.ceil(Math.max(pop, box) + 2 * spacing.sm);
};

/**
 * Where captions go.
 * `short`: a band at the bottom of the safe area, so it sits above the
 * platform's description UI and left of its action buttons.
 * `long`: centered in the lower third.
 */
export const captionBand = (
  preset: PresetName,
  safe: Insets = platformSafeArea[preset],
): Rect => {
  const { width, height, padding } = presets[preset];
  const bandHeight = captionBandHeight(preset);
  if (preset === "long") {
    const bandWidth = Math.min(width * LONG_BAND_WIDTH, width - safe.left - safe.right - 2 * padding);
    const center = Math.min(height * LONG_BAND_CENTER_Y, height - safe.bottom - bandHeight / 2);
    return {
      top: Math.round(center - bandHeight / 2),
      left: Math.round((width - bandWidth) / 2),
      width: Math.round(bandWidth),
      height: bandHeight,
    };
  }
  const left = Math.max(safe.left, padding);
  const right = Math.max(safe.right, padding);
  const bottom = Math.max(safe.bottom, padding);
  return {
    top: height - bottom - bandHeight,
    left,
    width: width - left - right,
    height: bandHeight,
  };
};

/**
 * Space scene content may use, as insets from each frame edge: inside the
 * safe area and the preset padding, and ending above the caption band.
 */
export const visualZone = (
  preset: PresetName,
  safe: Insets = platformSafeArea[preset],
): Insets => {
  const { height, padding } = presets[preset];
  const band = captionBand(preset, safe);
  // In `long` the side padding is too tall to reuse vertically.
  const vertical = preset === "long" ? spacing.xl : padding;
  return {
    top: Math.max(safe.top, vertical),
    right: Math.max(safe.right, padding),
    bottom: height - band.top + ZONE_GAP,
    left: Math.max(safe.left, padding),
  };
};

/** Bottom edge of the visual zone, in px from the top of the frame. */
export const visualZoneBottomPx = (preset: PresetName, safe?: Insets): number =>
  presets[preset].height - visualZone(preset, safe).bottom;

/** Pixels from the bottom edge taken by the caption band (and everything below it). */
export const captionSafeBottom = (preset: PresetName, safe?: Insets): number =>
  presets[preset].height - captionBand(preset, safe).top;

/** The visual zone as a box. */
export const visualZoneRect = (preset: PresetName, safe?: Insets): Rect => {
  const { width, height } = presets[preset];
  const z = visualZone(preset, safe);
  return {
    top: z.top,
    left: z.left,
    width: width - z.left - z.right,
    height: height - z.top - z.bottom,
  };
};

/** Gap between "pop" caption words, in em. */
export const POP_WORD_GAP_EM = 0.3;
/** Letter spacing of "pop" caption words, in em. */
export const POP_LETTER_SPACING_EM = -0.01;
/** Largest scale the spoken word pops to, spring overshoot included. */
export const POP_WORD_MAX_SCALE = 1.16;

/** Width of a "pop" caption word in px at scale 1 (Inter ExtraBold metrics). */
export const popWordWidth = (text: string, fontSize: number): number =>
  measureInterBold(text, POP_LETTER_SPACING_EM) * fontSize;

/**
 * Extra room on each side of a word scaled by `scale` from its center. Used
 * as the word's horizontal margin so a popped word pushes its neighbors
 * apart instead of overlapping them.
 */
export const popWordOverflow = (text: string, fontSize: number, scale: number): number =>
  (Math.max(0, scale - 1) * popWordWidth(text, fontSize)) / 2;

/**
 * Splits a "pop" chunk into lines (arrays of word indices) that fit
 * `maxWidth` even while the widest word of the line is fully popped, so the
 * line breaks never change while words pop in turn. A word wider than
 * `maxWidth` gets a line of its own.
 */
export const popCaptionLines = (
  words: readonly string[],
  fontSize: number,
  maxWidth: number,
): number[][] => {
  const gap = POP_WORD_GAP_EM * fontSize;
  const lines: number[][] = [];
  let line: number[] = [];
  let width = 0;
  let widest = 0;
  words.forEach((text, i) => {
    const w = popWordWidth(text, fontSize);
    const nextWidth = width + (line.length > 0 ? gap : 0) + w;
    const nextWidest = Math.max(widest, w);
    if (line.length > 0 && nextWidth + (POP_WORD_MAX_SCALE - 1) * nextWidest > maxWidth) {
      lines.push(line);
      line = [i];
      width = w;
      widest = w;
    } else {
      line.push(i);
      width = nextWidth;
      widest = nextWidest;
    }
  });
  if (line.length > 0) lines.push(line);
  return lines;
};
