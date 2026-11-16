/**
 * Text clean-up for upload fields. YouTube rejects titles and descriptions
 * that contain < or >, so every platform gets the same safe version: "=>"
 * becomes "→" and any other angle bracket becomes "‹" or "›". The pinned
 * comment keeps the original code, with a fallback that swaps them too.
 */

const EM_DASH = "—";

/** Em dashes become commas: "Memo it — once" -> "Memo it, once". */
export const stripEmDashes = (text: string): string =>
  text.replace(/\s*—\s*/g, ", ").split(EM_DASH).join(",");

/** For titles, descriptions and captions on every platform. */
export const sanitizeAngleBrackets = (text: string): string =>
  text.replace(/=>/g, "→").replace(/</g, "‹").replace(/>/g, "›");

/** Angle-bracket safe and em dash free. */
export const sanitizePlatformText = (text: string): string => sanitizeAngleBrackets(stripEmDashes(text));

/**
 * Fallback for the pinned comment, for a platform that rejects the original:
 * "=>" becomes "⇒" so arrow functions still read as code, other < and > become ‹ ›.
 */
export const fallbackCode = (code: string): string =>
  stripEmDashes(code).replace(/=>/g, "⇒").replace(/</g, "‹").replace(/>/g, "›");

/** True when a platform that blocks angle brackets would reject the text. */
export const hasAngleBrackets = (text: string): boolean => /[<>]/.test(text);
