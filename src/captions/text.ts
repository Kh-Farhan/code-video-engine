const EM_DASH = /\s*—\s*/g;

/**
 * Cleans caption text: em dashes become commas, whitespace collapses.
 * "Memo it — once" -> "Memo it, once".
 */
export const sanitizeCaptionText = (text: string): string =>
  text
    .replace(EM_DASH, ", ")
    .replace(/,(\s*,)+/g, ",")
    .replace(/,\s*([.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+/, "")
    .replace(/[\s,]+$/, "")
    .trim();

/** Splits narration into caption words (sanitized, whitespace-separated). */
export const splitWords = (text: string): string[] => {
  const clean = sanitizeCaptionText(text);
  return clean ? clean.split(" ") : [];
};
