import type { PresetName } from "../theme";

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
