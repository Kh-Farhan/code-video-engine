import { visualZoneRect } from "../captions/layout";
import { presets, spacing, type PresetName } from "../theme";
import { endsSentence } from "../thumbnail/fitText";
import { measureInterBold } from "../thumbnail/interMetrics";

/**
 * Layout of the title scene's hook heading: which parts are code, where the
 * lines break and how big it can be. Pure, so the same result comes out in
 * Node (tests) and in the browser, and lines render exactly as computed.
 *
 * The heading is the first thing a Shorts viewer sees, so it is made as large
 * as the box allows in at most `maxLines` lines. Code in it (`[1, 2].sort()`,
 * `user.name`, `typeof null === 'object'`) is drawn in the code font with
 * syntax colors.
 */

/**
 * One unbreakable piece of the heading. Line breaks only happen between
 * units. A `glued` unit (punctuation after code) follows the one before it
 * with no space and no line break.
 */
export type HeadingUnit = { text: string; code: boolean; glued?: boolean };

/** A run of units on one line with the same kind, drawn as one span. */
export type HeadingRun = { text: string; code: boolean };

export type HeadingLayout = {
  fontSize: number;
  /** Line height as a multiple of the font size: taller when code pills need room. */
  lineHeight: number;
  lines: HeadingRun[][];
};

/** Letter spacing of the sans heading text, in em. */
export const HEADING_LETTER_SPACING_EM = -0.02;
/** Line height of the heading, as a multiple of the font size. */
export const HEADING_LINE_HEIGHT = 1.08;
/** Line height when the heading has code, so pills on stacked lines do not touch. */
export const HEADING_CODE_LINE_HEIGHT = 1.22;
/** Height of a code pill (line box plus vertical padding), in em. */
export const CODE_PILL_LINE_HEIGHT = 1.04;
export const CODE_PILL_PADDING_Y_EM = 0.03;
/** Advance width of every JetBrains Mono glyph, in em. */
export const MONO_ADVANCE_EM = 0.6;
/** Horizontal padding inside a code pill, on each side, in em. */
export const CODE_PILL_PADDING_EM = 0.14;
/** Kerning and rounding margin: fitted text uses at most this share of its box. */
const WIDTH_SAFETY = 0.96;

const OPEN = "([{";
const CLOSE = ")]}";

/** Words that read as code on their own in a heading. */
const CODE_KEYWORDS = new Set(["typeof", "null", "undefined", "NaN", "true", "false", "const"]);
const CODE_OPERATORS = new Set(["===", "!==", "==", "!=", "=>"]);

/** Punctuation that ends a sentence or clause, kept in prose after a code unit. */
const TRAILING = /[.,;:!?]+$/;

/** Whether a bare word (no trailing punctuation) looks like code. */
export const looksLikeCode = (word: string): boolean => {
  if (word.length === 0) return false;
  if (/^`.*`$/.test(word)) return true;
  if (/[()[\]{}]/.test(word)) return true;
  if (CODE_OPERATORS.has(word) || CODE_KEYWORDS.has(word)) return true;
  if (/^'.+'$/.test(word)) return true;
  // camelCase identifiers: setTimeout, useMemo, setCount.
  if (/^[a-z_$][a-z0-9_$]*[A-Z][\w$]*$/.test(word)) return true;
  // Member access starting lowercase: user.name, params.slug, this.n (not Next.js).
  if (/^[a-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(word)) return true;
  return false;
};

/**
 * Splits the heading into units: words, except that a bracket group or a
 * single-quoted string stays whole ("[1, 2, 10].sort()", "'use client'").
 * Backticks mark code explicitly and are removed. Punctuation after a code
 * unit is split off as prose, so "params.slug." keeps its period plain.
 */
export const headingUnits = (heading: string): HeadingUnit[] => {
  const words = heading.trim().split(/\s+/).filter(Boolean);
  const groups: string[] = [];
  let current: string[] = [];
  let depth = 0;
  let quote: "'" | "`" | undefined;
  for (const word of words) {
    current.push(word);
    for (const [i, ch] of [...word].entries()) {
      if (quote) {
        if (ch === quote) quote = undefined;
      } else if ((ch === "'" || ch === "`") && (i === 0 || OPEN.includes(word[i - 1]!))) {
        // A quote opens at the start of a word (not the apostrophe in "It's").
        quote = ch;
      } else if (OPEN.includes(ch)) depth++;
      else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && !quote) {
      groups.push(current.join(" "));
      current = [];
    }
  }
  if (current.length > 0) groups.push(current.join(" "));

  const units: HeadingUnit[] = [];
  for (const group of groups) {
    const trailing = group.match(TRAILING)?.[0] ?? "";
    const bare = group.slice(0, group.length - trailing.length);
    if (looksLikeCode(bare)) {
      units.push({ text: bare.replace(/^`(.*)`$/, "$1"), code: true });
      if (trailing) units.push({ text: trailing, code: false, glued: true });
    } else {
      units.push({ text: group, code: false });
    }
  }
  return units;
};

type Unit = HeadingUnit;

/** Joins units into runs of the same kind, as they are drawn on one line. */
export const runsOf = (units: readonly Unit[]): HeadingRun[] => {
  const runs: HeadingRun[] = [];
  units.forEach((u, i) => {
    const last = runs.at(-1);
    const space = i === 0 || u.glued ? "" : " ";
    if (!last) runs.push({ text: u.text, code: u.code });
    else if (last.code === u.code) last.text += space + u.text;
    else if (u.code) {
      // The space between prose and code stays on the prose side, outside the pill.
      last.text += space;
      runs.push({ text: u.text, code: true });
    } else runs.push({ text: space + u.text, code: false });
  });
  return runs;
};

/** Width of a line of units, in em of the heading font size. */
export const lineWidthEm = (units: readonly Unit[]): number =>
  runsOf(units).reduce(
    (w, run) =>
      w +
      (run.code
        ? run.text.length * MONO_ADVANCE_EM + 2 * CODE_PILL_PADDING_EM
        : measureInterBold(run.text, HEADING_LETTER_SPACING_EM)),
    0,
  );

/** Breaks between units that may start a new line (never before glued punctuation). */
const breakable = (units: readonly Unit[], i: number) => !units[i]?.glued;

/**
 * Splits units into exactly `count` lines so the widest is as narrow as
 * possible. With `keepSentences`, no line runs from one sentence into the
 * next (widest is Infinity when that is impossible).
 */
const balanced = (
  units: readonly Unit[],
  count: number,
  keepSentences: boolean,
): { lines: Unit[][]; widest: number } => {
  const n = units.length;
  const width = (from: number, to: number) => {
    // A sentence ends at prose ending in . ! or ? (glued punctuation counts) not followed by glued text.
    const endsAt = (k: number) => !units[k]!.code && endsSentence(units[k]!.text) && !units[k + 1]?.glued;
    if (keepSentences && Array.from({ length: to - 1 - from }, (_, k) => from + k).some(endsAt)) {
      return Infinity;
    }
    return lineWidthEm(units.slice(from, to));
  };
  const best: number[][] = Array.from({ length: count + 1 }, () => Array<number>(n + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: count + 1 }, () => Array<number>(n + 1).fill(0));
  best[0]![0] = 0;
  for (let k = 1; k <= count; k++) {
    for (let i = k; i <= n; i++) {
      if (i < n && !breakable(units, i)) continue;
      for (let j = k - 1; j < i; j++) {
        if (j > 0 && !breakable(units, j)) continue;
        const candidate = Math.max(best[k - 1]![j]!, width(j, i));
        if (candidate < best[k]![i]!) {
          best[k]![i] = candidate;
          cut[k]![i] = j;
        }
      }
    }
  }
  if (best[count]![n] === Infinity) return { lines: [], widest: Infinity };
  const lines: Unit[][] = [];
  for (let k = count, i = n; k > 0; k--) {
    const j = cut[k]![i]!;
    lines.unshift(units.slice(j, i));
    i = j;
  }
  return { lines, widest: best[count]![n]! };
};

export type FitTitleHeadingOptions = {
  heading: string;
  maxWidth: number;
  maxHeight: number;
  maxLines: number;
  minFontSize: number;
  maxFontSize: number;
};

/**
 * The largest font size at which the heading fits the box in at most
 * `maxLines` balanced lines (fewer lines win ties). Lines break between
 * sentences when that costs less than a tenth of the size. If even
 * `maxLines` lines would go below `minFontSize`, more lines are allowed so
 * the text stays readable.
 */
export const fitTitleHeading = ({
  heading,
  maxWidth,
  maxHeight,
  maxLines,
  minFontSize,
  maxFontSize,
}: FitTitleHeadingOptions): HeadingLayout => {
  const units = headingUnits(heading);
  const lineHeight = units.some((u) => u.code) ? HEADING_CODE_LINE_HEIGHT : HEADING_LINE_HEIGHT;
  if (units.length === 0) return { fontSize: maxFontSize, lineHeight, lines: [] };
  const fit = (keepSentences: boolean, lineLimit: number) => {
    let result: { fontSize: number; lines: Unit[][] } | undefined;
    for (let count = 1; count <= Math.min(lineLimit, units.length); count++) {
      const { lines, widest } = balanced(units, count, keepSentences);
      if (!Number.isFinite(widest)) continue;
      const byWidth = (maxWidth * WIDTH_SAFETY) / widest;
      const byHeight = maxHeight / (count * lineHeight);
      const fontSize = Math.floor(Math.min(maxFontSize, byWidth, byHeight));
      if (!result || fontSize > result.fontSize) result = { fontSize, lines };
    }
    return result;
  };
  const choose = (lineLimit: number) => {
    const free = fit(false, lineLimit)!;
    const bySentence = fit(true, lineLimit);
    return bySentence && bySentence.fontSize >= free.fontSize * 0.9 ? bySentence : free;
  };
  let best = choose(maxLines);
  for (let limit = maxLines + 1; best.fontSize < minFontSize && limit <= units.length; limit++) {
    best = choose(limit);
  }
  return {
    fontSize: Math.max(minFontSize, best.fontSize),
    lineHeight,
    lines: best.lines.map((line) => runsOf(line)),
  };
};

/** Share of the frame width a text heading may fill in `short` (of the visual zone width in `long`). */
export const TITLE_HEADING_WIDTH_SHARE = 0.85;
/** Same for a code heading: its longest line fills about 90%. */
export const CODE_HEADING_WIDTH_SHARE = 0.9;
/** Lines the heading may use before it is allowed to go smaller than the cap. */
export const TITLE_HEADING_MAX_LINES = 3;
/** Font size limits of the heading, per preset. The minimum keeps phone readability. */
export const TITLE_HEADING_FONT: Record<PresetName, { min: number; max: number }> = {
  short: { min: 72, max: 200 },
  long: { min: 64, max: 160 },
};
/** Where the title block is centered, as a share of the frame height. */
export const TITLE_BLOCK_CENTER = 0.39;
/** The topic tag above the heading (the subheading in small caps), in px. */
export const TOPIC_TAG: Record<PresetName, { fontSize: number; gap: number }> = {
  short: { fontSize: 48, gap: spacing.md },
  long: { fontSize: 36, gap: spacing.md },
};
export const TOPIC_TAG_LINE_HEIGHT = 1.2;

/**
 * Where the title block sits: centered at TITLE_BLOCK_CENTER of the frame
 * height (moved toward the visual zone's middle if needed), and the most
 * height it may take while staying centered there inside the visual zone,
 * so it never reaches the caption band. `offsetY` is how far that center is
 * below the visual zone's center.
 */
export const titleBlock = (preset: PresetName): { offsetY: number; maxHeight: number } => {
  const zone = visualZoneRect(preset);
  const zoneCenter = zone.top + zone.height / 2;
  const target = TITLE_BLOCK_CENTER * presets[preset].height;
  const center = Math.min(zone.top + zone.height * 0.75, Math.max(zone.top + zone.height * 0.25, target));
  const half = Math.min(center - zone.top, zone.top + zone.height - center);
  return { offsetY: Math.round(center - zoneCenter), maxHeight: Math.floor(2 * half) };
};

/**
 * The box the heading is fitted into. Width: `share` of the frame width in
 * `short` (centered on the visual zone, so it may reach a little past the
 * zone's side insets), of the visual zone width in `long`. Height: the
 * title block minus the topic tag.
 */
export const titleHeadingBox = (
  preset: PresetName,
  hasTag: boolean,
  share = TITLE_HEADING_WIDTH_SHARE,
): { maxWidth: number; maxHeight: number } => {
  const zone = visualZoneRect(preset);
  const maxWidth = Math.round(share * (preset === "short" ? presets[preset].width : zone.width));
  const tag = hasTag ? TOPIC_TAG[preset].fontSize * TOPIC_TAG_LINE_HEIGHT + TOPIC_TAG[preset].gap : 0;
  return { maxWidth, maxHeight: Math.floor(titleBlock(preset).maxHeight - tag) };
};

/** Heading layout for a text title in `preset`. */
export const titleHeadingLayout = (
  heading: string,
  preset: PresetName,
  hasTag: boolean,
): HeadingLayout & { maxWidth: number } => {
  const { maxWidth, maxHeight } = titleHeadingBox(preset, hasTag);
  const { min, max } = TITLE_HEADING_FONT[preset];
  return {
    maxWidth,
    ...fitTitleHeading({
      heading,
      maxWidth,
      maxHeight,
      maxLines: TITLE_HEADING_MAX_LINES,
      minFontSize: min,
      maxFontSize: max,
    }),
  };
};

/* ---------- Code headings: "input gives result" ---------- */

/** Words that join an input to its result: drawn as an arrow. */
const CONNECTOR_WORDS = new Set(["gives", "returns", "is", "equals", "prints", "logs", "outputs", "becomes", "->", "=", "→"]);
/** Operators that join an input to its result: kept, drawn in the accent color. */
const CONNECTOR_OPERATORS = new Set(["===", "=="]);

/** A heading that is code, a connector, then code: "[1, 2, 10].sort() gives [1, 10, 2]". */
export type CodeHeading = {
  input: string;
  /** The operator kept between them ("==="), or undefined for an arrow. */
  operator?: string;
  result: string;
  /** Characters of `result` that are the surprise, drawn in the warning color. */
  surprise: { from: number; to: number };
};

/**
 * Reads a heading as input, connector, result when it is exactly that: code
 * units, then one connector word or operator, then code units. Anything
 * else (prose around the code) is a text heading.
 */
export const parseCodeHeading = (heading: string): CodeHeading | undefined => {
  const units = headingUnits(heading).filter((u, i, all) => !(u.glued && i === all.length - 1));
  for (let k = 1; k < units.length - 1; k++) {
    const u = units[k]!;
    const word = u.code ? CONNECTOR_OPERATORS.has(u.text) : CONNECTOR_WORDS.has(u.text.toLowerCase());
    if (!word) continue;
    const before = units.slice(0, k);
    const after = units.slice(k + 1);
    if (!before.every((x) => x.code && !x.glued) || !after.every((x) => x.code && !x.glued)) continue;
    const input = before.map((x) => x.text).join(" ");
    const result = after.map((x) => x.text).join(" ");
    return { input, operator: u.code ? u.text : undefined, result, surprise: surpriseRange(input, result) };
  }
  return undefined;
};

/** Items of the first flat [...] list in `code`, with their positions. */
const listItems = (code: string): { text: string; from: number; to: number }[] | undefined => {
  const m = /\[([^[\]]*)\]/.exec(code);
  if (!m) return undefined;
  const items: { text: string; from: number; to: number }[] = [];
  let at = m.index + 1;
  for (const raw of m[1]!.split(",")) {
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    items.push({ text, from: at + lead, to: at + lead + text.length });
    at += raw.length + 1;
  }
  return items;
};

/**
 * The surprising part of a result. When input and result hold lists of the
 * same length, it is the items that moved or changed ("10, 2" in
 * [1, 10, 2] after [1, 2, 10]); otherwise the whole result.
 */
export const surpriseRange = (input: string, result: string): { from: number; to: number } => {
  const whole = { from: 0, to: result.length };
  const a = listItems(input);
  const b = listItems(result);
  if (!a || !b || a.length !== b.length) return whole;
  const changed = b.map((item, i) => item.text !== a[i]!.text);
  const first = changed.indexOf(true);
  if (first < 0) return whole;
  const last = changed.lastIndexOf(true);
  return { from: b[first]!.from, to: b[last]!.to };
};

/** Width of the drawn arrow connector, in em. */
export const ARROW_WIDTH_EM = 0.9;
/** Line height of a code heading. */
export const CODE_HEADING_LINE_HEIGHT = 1.15;

export type CodeHeadingLayout = CodeHeading & { fontSize: number; lineHeight: number; maxWidth: number };

/** Width of each line of a code heading, in em: the input, then connector and result. */
export const codeHeadingLineWidthsEm = (h: CodeHeading): [number, number] => [
  h.input.length * MONO_ADVANCE_EM,
  (h.operator ? h.operator.length * MONO_ADVANCE_EM : ARROW_WIDTH_EM) + MONO_ADVANCE_EM + h.result.length * MONO_ADVANCE_EM,
];

/**
 * Layout of a code heading: the input on one line, the connector and the
 * result on the next, both at one size, as large as fits with the longest
 * line at about 90% of the frame width. Undefined when the heading is not a
 * code heading, or would go below the readable minimum (then it is laid out
 * as text, which may wrap).
 */
export const codeHeadingLayout = (
  heading: string,
  preset: PresetName,
  hasTag: boolean,
): CodeHeadingLayout | undefined => {
  const parsed = parseCodeHeading(heading);
  if (!parsed) return undefined;
  const { maxWidth, maxHeight } = titleHeadingBox(preset, hasTag, CODE_HEADING_WIDTH_SHARE);
  const { min, max } = TITLE_HEADING_FONT[preset];
  const widest = Math.max(...codeHeadingLineWidthsEm(parsed));
  const fontSize = Math.floor(
    Math.min(max, (maxWidth * WIDTH_SAFETY) / widest, maxHeight / (2 * CODE_HEADING_LINE_HEIGHT)),
  );
  if (fontSize < min) return undefined;
  return { ...parsed, fontSize, lineHeight: CODE_HEADING_LINE_HEIGHT, maxWidth };
};
