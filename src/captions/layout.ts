import { presets, spacing, type PresetName } from "../theme";

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

/**
 * Pixels from the bottom edge that scene content must leave free so it never
 * sits under a caption: everything below the top of a two-line caption box,
 * plus a gap.
 */
export const captionSafeBottom = (preset: PresetName): number => {
  const { height, fontSize } = presets[preset];
  const boxHeight =
    CAPTION_MAX_LINES * fontSize.caption * CAPTION_LINE_HEIGHT + 2 * CAPTION_BOX_PADDING_Y;
  return Math.ceil(height * (1 - captionLayout[preset].centerY) + boxHeight / 2 + spacing.md);
};
