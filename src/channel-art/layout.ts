import { measureInterBold } from "../thumbnail/interMetrics";

/**
 * Channel art layout: pure data, safe to import from Node (CLI, tests).
 * Sizes follow YouTube's channel art guidance.
 */

export type Box = { left: number; top: number; width: number; height: number };

/** Copy shown on the channel art. No em dashes. */
export const channelArtContent = {
  name: "Frontend Gotchas",
  tagline: "Real bugs. Explained in under a minute.",
  code: "setCount(c => c + 1)",
  codeLanguage: "tsx",
} as const;

export const BANNER_WIDTH = 2560;
export const BANNER_HEIGHT = 1440;

/** The part of the banner every device shows (phones crop to it). All text stays inside. */
export const BANNER_SAFE_WIDTH = 1546;
export const BANNER_SAFE_HEIGHT = 423;

export const bannerSafeArea: Box = {
  left: Math.floor((BANNER_WIDTH - BANNER_SAFE_WIDTH) / 2),
  top: Math.floor((BANNER_HEIGHT - BANNER_SAFE_HEIGHT) / 2),
  width: BANNER_SAFE_WIDTH,
  height: BANNER_SAFE_HEIGHT,
};

/** Advance width of JetBrains Mono, in em (every glyph is the same width). */
export const MONO_ADVANCE_EM = 0.6;

/** Banner text sizes and gaps, in px. Stacked and centered inside the safe area. */
export const bannerLayout = {
  name: { fontSize: 136, lineHeight: 1.05, letterSpacingEm: -0.025 },
  tagline: { fontSize: 54, lineHeight: 1.2 },
  /** Gap between name and tagline, and between tagline and code card. */
  gapNameTagline: 20,
  gapTaglineCode: 36,
  code: { fontSize: 46, lineHeight: 1.4, padX: 40, padY: 20, dot: 18, dotGap: 12 },
} as const;

/** Widths and heights of each banner element, for layout checks. */
export const bannerMetrics = () => {
  const { name, tagline, code } = bannerLayout;
  const nameWidth = measureInterBold(channelArtContent.name, name.letterSpacingEm) * name.fontSize;
  // Measured with ExtraBold metrics; the tagline renders lighter, so this is an upper bound.
  const taglineWidth = measureInterBold(channelArtContent.tagline) * tagline.fontSize;
  const codeTextWidth = channelArtContent.code.length * MONO_ADVANCE_EM * code.fontSize;
  const dotsWidth = 3 * code.dot + 2 * code.dotGap;
  const codeWidth = 2 * code.padX + dotsWidth + code.padX + codeTextWidth;
  const nameHeight = name.fontSize * name.lineHeight;
  const taglineHeight = tagline.fontSize * tagline.lineHeight;
  const codeHeight = code.fontSize * code.lineHeight + 2 * code.padY;
  const totalHeight =
    nameHeight + bannerLayout.gapNameTagline + taglineHeight + bannerLayout.gapTaglineCode + codeHeight;
  return { nameWidth, taglineWidth, codeWidth, nameHeight, taglineHeight, codeHeight, totalHeight };
};

export const PROFILE_SIZE = 800;
/** The size YouTube shows the profile image at in comments; the mark must read at this size. */
export const PROFILE_SMALL_SIZE = 98;

export const profileMarks = ["FG", "</>"] as const;
export type ProfileMark = (typeof profileMarks)[number];

/** Mark font size per mark, in px at 800x800. Both fit well inside the circle crop. */
export const profileLayout = {
  fontSize: { FG: 380, "</>": 300 } satisfies Record<ProfileMark, number>,
  letterSpacingEm: -0.04,
  /** YouTube crops to a circle; keep the mark inside this share of the diameter. */
  maxMarkWidthShare: 0.72,
} as const;

export const profileMarkWidth = (mark: ProfileMark): number =>
  measureInterBold(mark, profileLayout.letterSpacingEm) * profileLayout.fontSize[mark];
