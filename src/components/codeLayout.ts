import type { LineRange } from "../schema/script";

/**
 * Pure layout for monospace code. Because every glyph has the same advance,
 * wrapping and fitting are computed here instead of measured in the browser,
 * so line positions are known exactly and nothing can overflow.
 */

/** Advance width of JetBrains Mono, in em. */
export const CHAR_WIDTH_EM = 0.6;
export const LINE_HEIGHT_EM = 1.5;
/** Extra indent, in characters, for the continuation rows of a wrapped line. */
export const WRAP_INDENT = 2;

/** One syntax-highlighted run of text. */
export type CodeToken = {
  content: string;
  color?: string;
  /** Shiki font style bit flags: 1 italic, 2 bold, 4 underline. */
  fontStyle?: number;
};

/** One visual row: a whole line, or one piece of a wrapped line. */
export type CodeRow = {
  /** 0-based source line. */
  line: number;
  continuation: boolean;
  tokens: CodeToken[];
};

export type CodeLayout = {
  fontSize: number;
  lineHeight: number;
  charWidth: number;
  /** Characters that fit on one row. */
  cols: number;
  /** First row of each source line. */
  rowStarts: number[];
  /** Number of rows each source line takes. */
  rowCounts: number[];
  totalRows: number;
  /** Width actually used by the text, in px. */
  contentWidth: number;
  contentHeight: number;
};

/** Expands tabs and drops trailing blank lines, matching how the schema counts lines. */
export const normalizeCode = (code: string): string =>
  code.replace(/\t/g, "  ").replace(/\n+$/, "");

/**
 * Start offset of each row of a line. Breaks after the last space that fits
 * when there is one in the back half of the row, otherwise mid-token.
 */
export const segmentStarts = (text: string, cols: number): number[] => {
  const starts = [0];
  let start = 0;
  let room = cols;
  while (text.length - start > room) {
    let end = start + room;
    const space = text.lastIndexOf(" ", end - 1);
    if (space + 1 > start + room / 2) end = space + 1;
    starts.push(end);
    start = end;
    room = Math.max(1, cols - WRAP_INDENT);
  }
  return starts;
};

export const rowsForLine = (text: string, cols: number): number =>
  segmentStarts(text, cols).length;

type LayoutInput = {
  lines: readonly string[];
  /** Box available for the text, in px. */
  width: number;
  height: number;
  baseFontSize: number;
  /** Smallest size to shrink to before wrapping long lines instead. */
  minFontSize: number;
};

/**
 * Picks a font size: shrinks long lines down to `minFontSize`, wraps whatever
 * is still too wide, then shrinks further if the rows do not fit the height.
 */
export const layoutCode = ({
  lines,
  width,
  height,
  baseFontSize,
  minFontSize,
}: LayoutInput): CodeLayout => {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const fitWidth = width / (longest * CHAR_WIDTH_EM);
  let fontSize = Math.min(baseFontSize, Math.max(minFontSize, fitWidth));

  for (;;) {
    const charWidth = fontSize * CHAR_WIDTH_EM;
    const lineHeight = fontSize * LINE_HEIGHT_EM;
    const cols = Math.max(WRAP_INDENT + 1, Math.floor(width / charWidth + 1e-9));
    const rowCounts = lines.map((line) => rowsForLine(line, cols));
    const rowStarts: number[] = [];
    let totalRows = 0;
    for (const count of rowCounts) {
      rowStarts.push(totalRows);
      totalRows += count;
    }
    const fits = totalRows * lineHeight <= height && cols * charWidth <= width;
    if (fits || fontSize <= 4) {
      return {
        fontSize,
        lineHeight,
        charWidth,
        cols,
        rowStarts,
        rowCounts,
        totalRows,
        contentWidth: Math.min(longest, cols) * charWidth,
        contentHeight: totalRows * lineHeight,
      };
    }
    fontSize *= 0.95;
  }
};

/** Converts 1-based inclusive line ranges into 1-based inclusive row ranges. */
export const lineRangesToRows = (
  ranges: readonly LineRange[],
  layout: Pick<CodeLayout, "rowStarts" | "rowCounts">,
): LineRange[] =>
  ranges.map(({ from, to }) => {
    const first = layout.rowStarts[from - 1] ?? 0;
    const last =
      (layout.rowStarts[to - 1] ?? 0) + (layout.rowCounts[to - 1] ?? 1);
    return { from: first + 1, to: last };
  });

/** Characters [start, end) of a tokenized line. */
export const sliceTokens = (
  tokens: readonly CodeToken[],
  start: number,
  end: number,
): CodeToken[] => {
  const out: CodeToken[] = [];
  let offset = 0;
  for (const token of tokens) {
    const tokenEnd = offset + token.content.length;
    const a = Math.max(start, offset);
    const b = Math.min(end, tokenEnd);
    if (b > a) {
      out.push({ ...token, content: token.content.slice(a - offset, b - offset) });
    }
    offset = tokenEnd;
    if (offset >= end) break;
  }
  return out;
};

export type BuiltRows = {
  rows: CodeRow[];
  /** Row and column right after the last visible character. */
  cursor: { row: number; col: number };
};

/**
 * Splits tokenized lines into rows of at most `cols` characters, keeping only
 * the first `visibleChars` characters of the whole code (newlines count as
 * one). Rows past the reveal are kept but empty, so nothing reflows while typing.
 */
export const buildRows = (
  lines: readonly (readonly CodeToken[])[],
  cols: number,
  visibleChars: number = Infinity,
): BuiltRows => {
  const rows: CodeRow[] = [];
  let cursor = { row: 0, col: 0 };
  let offset = 0;
  lines.forEach((tokens, line) => {
    const text = tokens.map((t) => t.content).join("");
    const length = text.length;
    const visible = Math.min(length, Math.max(0, visibleChars - offset));
    const starts = segmentStarts(text, cols);
    const firstRow = rows.length;
    starts.forEach((start, i) => {
      const end = starts[i + 1] ?? length;
      rows.push({
        line,
        continuation: i > 0,
        tokens: sliceTokens(tokens, start, Math.min(end, visible)),
      });
    });
    if (visibleChars >= offset) {
      let seg = 0;
      while (seg + 1 < starts.length && (starts[seg + 1] ?? 0) < visible) seg++;
      cursor = {
        row: firstRow + seg,
        col: (seg > 0 ? WRAP_INDENT : 0) + visible - (starts[seg] ?? 0),
      };
    }
    offset += length + 1;
  });
  return { rows, cursor };
};
