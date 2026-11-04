import type { Script } from "../schema/script";
import {
  accentWordIndex,
  headlineFromScript,
  snippetFromScript,
  tagFromScript,
  type CodeSnippet,
} from "./content";
import { fitHeadline, fitLine, type FittedHeadline } from "./fitText";

/**
 * Thumbnail formats and their fixed geometry, in px. Pure data plus the
 * fitting step, so tests can check every example script fits.
 */

export const thumbnailFormatNames = ["landscape", "cover"] as const;
export type ThumbnailFormatName = (typeof thumbnailFormatNames)[number];

export type ThumbnailFormat = {
  name: ThumbnailFormatName;
  width: number;
  height: number;
  padding: number;
  /** Width of the text column (tag and headline). */
  textWidth: number;
  headline: {
    maxHeight: number;
    maxLines: number;
    minFontSize: number;
    maxFontSize: number;
    lineHeight: number;
    letterSpacingEm: number;
  };
  tag: { minFontSize: number; maxFontSize: number; letterSpacingEm: number; padX: number };
  brandFontSize: number;
  code: {
    /** Left edge of the code card. The card runs past the right edge and is cropped. */
    left: number;
    top: number;
    width: number;
    lines: number;
    fontSize: number;
    rotateDeg: number;
  };
};

export const thumbnailFormats: Record<ThumbnailFormatName, ThumbnailFormat> = {
  /** YouTube thumbnail, 16:9. Text on the left, code peeking in from the right. */
  landscape: {
    name: "landscape",
    width: 1280,
    height: 720,
    padding: 64,
    textWidth: 760,
    headline: {
      maxHeight: 430,
      maxLines: 3,
      minFontSize: 64,
      maxFontSize: 150,
      lineHeight: 1.04,
      letterSpacingEm: -0.025,
    },
    tag: { minFontSize: 22, maxFontSize: 30, letterSpacingEm: 0.06, padX: 20 },
    brandFontSize: 26,
    code: { left: 860, top: 150, width: 520, lines: 8, fontSize: 24, rotateDeg: -4 },
  },
  /**
   * Shorts cover, 9:16. Everything sits between the top 12% and the bottom
   * 20%, which the Shorts player covers with its own buttons and title.
   */
  cover: {
    name: "cover",
    width: 1080,
    height: 1920,
    padding: 72,
    textWidth: 936,
    headline: {
      maxHeight: 640,
      maxLines: 4,
      minFontSize: 96,
      maxFontSize: 190,
      lineHeight: 1.04,
      letterSpacingEm: -0.025,
    },
    tag: { minFontSize: 30, maxFontSize: 46, letterSpacingEm: 0.06, padX: 28 },
    brandFontSize: 40,
    code: { left: 72, top: 0, width: 1100, lines: 9, fontSize: 36, rotateDeg: -3 },
  },
};

export const formatForSize = (width: number, height: number): ThumbnailFormat =>
  height > width ? thumbnailFormats.cover : thumbnailFormats.landscape;

export type ThumbnailContent = {
  headline: FittedHeadline & { accentWord: number };
  tag?: { text: string; fontSize: number };
  snippet?: CodeSnippet;
  handle?: string;
};

/** Reads the script and fits its text into `format`. */
export const thumbnailContent = (script: Script, format: ThumbnailFormat): ThumbnailContent => {
  const snippet = snippetFromScript(script, format.code.lines);
  const headlineText = headlineFromScript(script);
  const fitted = fitHeadline({
    text: headlineText,
    maxWidth: format.textWidth,
    ...format.headline,
  });
  const tagText = tagFromScript(script);
  const tag = tagText
    ? fitLine({
        text: tagText.toUpperCase(),
        maxWidth: format.textWidth - 2 * format.tag.padX,
        minFontSize: format.tag.minFontSize,
        maxFontSize: format.tag.maxFontSize,
        letterSpacingEm: format.tag.letterSpacingEm,
      })
    : undefined;
  return {
    headline: { ...fitted, accentWord: accentWordIndex(headlineText, snippet?.code) },
    tag,
    snippet,
    handle: script.brand?.handle,
  };
};
