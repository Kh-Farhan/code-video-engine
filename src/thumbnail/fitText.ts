import { measureInterBold } from "./interMetrics";

/**
 * Pure text fitting for the thumbnail. Widths come from the Inter ExtraBold
 * metrics, so the result is the same in Node (tests) and in the browser, and
 * the lines are rendered exactly as computed (no browser wrapping).
 */

/** Kerning and rounding margin: fitted text uses at most this share of its box. */
const WIDTH_SAFETY = 0.96;

export type FitHeadlineOptions = {
  text: string;
  maxWidth: number;
  maxHeight: number;
  maxLines: number;
  minFontSize: number;
  maxFontSize: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
  letterSpacingEm?: number;
};

export type FittedHeadline = {
  fontSize: number;
  lines: string[];
};

export const splitWords = (text: string): string[] => text.trim().split(/\s+/).filter(Boolean);

/**
 * Splits `words` into exactly `count` lines so the widest line is as narrow as
 * possible. Returns the lines and that widest width, in em.
 */
const balancedLines = (
  words: string[],
  count: number,
  letterSpacingEm: number,
): { lines: string[][]; widest: number } => {
  const width = (from: number, to: number) =>
    measureInterBold(words.slice(from, to).join(" "), letterSpacingEm);
  const n = words.length;
  // best[k][i]: narrowest widest line putting the first i words on k lines.
  const best: number[][] = Array.from({ length: count + 1 }, () => Array(n + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: count + 1 }, () => Array(n + 1).fill(0));
  best[0]![0] = 0;
  for (let k = 1; k <= count; k++) {
    for (let i = k; i <= n; i++) {
      for (let j = k - 1; j < i; j++) {
        const candidate = Math.max(best[k - 1]![j]!, width(j, i));
        if (candidate < best[k]![i]!) {
          best[k]![i] = candidate;
          cut[k]![i] = j;
        }
      }
    }
  }
  const lines: string[][] = [];
  for (let k = count, i = n; k > 0; k--) {
    const j = cut[k]![i]!;
    lines.unshift(words.slice(j, i));
    i = j;
  }
  return { lines, widest: best[count]![n]! };
};

/**
 * Largest font size at which `text` fits the box in at most `maxLines`
 * balanced lines. Fewer lines win ties. Never goes below `minFontSize`.
 */
export const fitHeadline = ({
  text,
  maxWidth,
  maxHeight,
  maxLines,
  minFontSize,
  maxFontSize,
  lineHeight,
  letterSpacingEm = 0,
}: FitHeadlineOptions): FittedHeadline => {
  const words = splitWords(text);
  if (words.length === 0) return { fontSize: maxFontSize, lines: [] };
  let result: FittedHeadline | undefined;
  for (let count = 1; count <= Math.min(maxLines, words.length); count++) {
    const { lines, widest } = balancedLines(words, count, letterSpacingEm);
    const byWidth = (maxWidth * WIDTH_SAFETY) / widest;
    const byHeight = maxHeight / (count * lineHeight);
    const fontSize = Math.floor(Math.min(maxFontSize, byWidth, byHeight));
    if (!result || fontSize > result.fontSize) {
      result = { fontSize, lines: lines.map((l) => l.join(" ")) };
    }
  }
  return { ...result!, fontSize: Math.max(minFontSize, result!.fontSize) };
};

export type FitLineOptions = {
  text: string;
  maxWidth: number;
  minFontSize: number;
  maxFontSize: number;
  letterSpacingEm?: number;
};

const ELLIPSIS = "...";

/**
 * One line of text: the largest font size that fits, and if even the
 * smallest does not, the text cut at a word boundary with an ellipsis.
 */
export const fitLine = ({
  text,
  maxWidth,
  minFontSize,
  maxFontSize,
  letterSpacingEm = 0,
}: FitLineOptions): { text: string; fontSize: number } => {
  const usable = maxWidth * WIDTH_SAFETY;
  const sizeFor = (t: string) =>
    Math.floor(Math.min(maxFontSize, usable / measureInterBold(t, letterSpacingEm)));
  const fontSize = sizeFor(text);
  if (fontSize >= minFontSize) return { text, fontSize };
  const words = splitWords(text);
  for (let count = words.length - 1; count >= 1; count--) {
    const cut = `${words.slice(0, count).join(" ").replace(/[,.;:!?]+$/, "")}${ELLIPSIS}`;
    if (sizeFor(cut) >= minFontSize) return { text: cut, fontSize: minFontSize };
  }
  return { text: words[0] ?? "", fontSize: minFontSize };
};
