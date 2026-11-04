import type { CaptionStyleName } from "../schema/script";
import { presets, spacing, type PresetName } from "../theme";
import type { ChunkOptions } from "./chunk";
import { measureInterBold } from "../thumbnail/interMetrics";

/**
 * Where captions sit, as fractions of the frame height.
 * `long`: centered in the lower third.
 * `short`: middle-lower, above the YouTube Shorts title/channel overlay
 * (bottom ~25%) and narrow enough to clear the right-side action buttons.
 */
export const captionLayout: Record<
  PresetName,
  { centerY: number; maxWidth: number }
> = {
  long: { centerY: 5 / 6, maxWidth: 0.8 },
  short: { centerY: 0.64, maxWidth: 0.74 },
};

/** Caption box line height, as a multiple of the caption font size. */
export const CAPTION_LINE_HEIGHT = 1.2;
/** Vertical padding inside the caption box, in px. */
export const CAPTION_BOX_PADDING_Y = spacing.sm;
/** Lines a caption chunk is expected to wrap to at most. */
const CAPTION_MAX_LINES = 2;

/** "pop" captions are bigger than the preset's caption size, so they read at a glance. */
export const POP_CAPTION_SCALE = 1.35;

export const captionFontSize = (preset: PresetName, style: CaptionStyleName): number =>
  Math.round(presets[preset].fontSize.caption * (style === "pop" ? POP_CAPTION_SCALE : 1));

/** Words on screen at once per style: short bursts for "pop", fuller lines for "box". */
export const captionChunkOptions: Record<CaptionStyleName, ChunkOptions> = {
  pop: { minWords: 2, maxWords: 4 },
  box: { minWords: 3, maxWords: 6 },
};

/**
 * Pixels from the bottom edge that scene content must leave free so it never
 * sits under a caption: everything below the top of a two-line caption box,
 * plus a gap.
 */
export const captionSafeBottom = (preset: PresetName): number => {
  const { height } = presets[preset];
  // The taller of the two styles, so a scene fits whichever one is used.
  const boxHeight = Math.max(
    CAPTION_MAX_LINES * captionFontSize(preset, "box") * CAPTION_LINE_HEIGHT + 2 * CAPTION_BOX_PADDING_Y,
    CAPTION_MAX_LINES * captionFontSize(preset, "pop") * CAPTION_LINE_HEIGHT,
  );
  return Math.ceil(height * (1 - captionLayout[preset].centerY) + boxHeight / 2 + spacing.md);
};

/** Gap between "pop" caption words, in em. */
export const POP_WORD_GAP_EM = 0.3;
/** Letter spacing of "pop" caption words, in em. */
export const POP_LETTER_SPACING_EM = -0.01;
/** Largest scale the spoken word pops to (its overshoot). */
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
