/**
 * Pause markers in narration: `[pause]` (the script's default length) or
 * `[pause:500]` (milliseconds). They are instructions for the voice track
 * only: they are never spoken and never shown, so every consumer of
 * narration text (captions, SRT, alignment, upload metadata) strips them.
 * Pure, so the schema, captions and CLI can all use it.
 */

/** Shortest and longest pause a marker may ask for, in ms. */
export const PAUSE_MARKER_MIN_MS = 50;
export const PAUSE_MARKER_MAX_MS = 3000;

/** `[pause]`, `[pause:500]`, `[ pause : 500ms ]`, any letter case. */
const MARKER = String.raw`\[\s*pause\s*(?::\s*(\d+)\s*(?:ms)?\s*)?\]`;
const markerPattern = () => new RegExp(MARKER, "gi");
/** Anything in brackets that mentions pause, so typos are reported instead of spoken. */
const pauseLike = () => /\[[^\]]*pause[^\]]*\]?/gi;

/** Narration with every marker removed and the gap closed up: "first [pause] then" -> "first then". */
export const stripPauseMarkers = (text: string): string =>
  text
    .replace(markerPattern(), " ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

export const hasPauseMarkers = (text: string): boolean => markerPattern().test(text);

/**
 * A stretch of narration between markers. `pauseAfterMs` is set when a
 * marker follows it: a number for `[pause:N]`, `null` for a bare `[pause]`
 * (the caller fills in its default). Several markers in a row add up.
 */
export type NarrationPart = { text: string; pauseAfterMs?: number | null };

/**
 * Splits narration at its markers. A marker at the very start comes back as
 * a part with empty text, so the caller can put the pause before the first
 * word (for a scene, that is the end of the previous scene).
 */
export const splitAtPauseMarkers = (text: string, defaultMs?: number): NarrationPart[] => {
  const parts: NarrationPart[] = [];
  let last = 0;
  for (const m of text.matchAll(markerPattern())) {
    const before = stripPauseMarkers(text.slice(last, m.index));
    const ms = m[1] === undefined ? (defaultMs ?? null) : Number(m[1]);
    const prev = parts.at(-1);
    if (!before && prev && prev.pauseAfterMs !== undefined) {
      // Back-to-back markers: one longer pause.
      const a = prev.pauseAfterMs ?? defaultMs;
      const b = ms ?? defaultMs;
      prev.pauseAfterMs = a === undefined || b === undefined ? null : a + b;
    } else {
      parts.push({ text: before, pauseAfterMs: ms });
    }
    last = m.index + m[0].length;
  }
  const rest = stripPauseMarkers(text.slice(last));
  if (rest || parts.length === 0) parts.push({ text: rest });
  return parts;
};

/** Problems with markers in one narration, worded for `validate`. */
export const pauseMarkerProblems = (text: string): string[] => {
  const problems: string[] = [];
  for (const m of text.matchAll(pauseLike())) {
    const exact = new RegExp(`^${MARKER}$`, "i").exec(m[0]);
    if (!exact) {
      problems.push(`"${m[0]}" is not a pause marker; write [pause] or [pause:500] (milliseconds)`);
      continue;
    }
    const ms = exact[1] === undefined ? undefined : Number(exact[1]);
    if (ms !== undefined && (ms < PAUSE_MARKER_MIN_MS || ms > PAUSE_MARKER_MAX_MS)) {
      problems.push(`"${m[0]}" must be ${PAUSE_MARKER_MIN_MS} to ${PAUSE_MARKER_MAX_MS}ms`);
    }
  }
  if (!stripPauseMarkers(text)) problems.push("must have words besides pause markers");
  return problems;
};
