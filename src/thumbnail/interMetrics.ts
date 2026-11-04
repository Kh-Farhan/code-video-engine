/**
 * Advance widths of Inter ExtraBold (public/fonts/inter-latin-800-normal.woff2)
 * for printable ASCII (space to tilde), in em. Read from the font's hmtx table,
 * so headline sizing is computed the same way in Node and in the browser.
 */
const ASCII_FIRST = 32;
const ASCII_WIDTHS: readonly number[] = [
  0.219, 0.358, 0.586, 0.655, 0.66, 1.029, 0.683, 0.354, 0.382, 0.382, 0.583, 0.686,
  0.353, 0.471, 0.353, 0.4, 0.692, 0.441, 0.638, 0.657, 0.688, 0.634, 0.662, 0.588,
  0.664, 0.662, 0.353, 0.36, 0.686, 0.686, 0.686, 0.579, 1.036, 0.77, 0.665, 0.744,
  0.723, 0.61, 0.585, 0.752, 0.749, 0.286, 0.59, 0.738, 0.565, 0.943, 0.766, 0.773,
  0.652, 0.782, 0.662, 0.66, 0.677, 0.727, 0.77, 1.059, 0.761, 0.752, 0.679, 0.382,
  0.4, 0.382, 0.493, 0.484, 0.382, 0.588, 0.638, 0.595, 0.638, 0.601, 0.41, 0.639,
  0.635, 0.283, 0.283, 0.593, 0.283, 0.927, 0.635, 0.619, 0.638, 0.638, 0.42, 0.573,
  0.382, 0.635, 0.615, 0.863, 0.594, 0.618, 0.581, 0.486, 0.388, 0.486, 0.686,
];

/** Used for anything outside printable ASCII. Wide on purpose so text never overflows. */
const FALLBACK_WIDTH_EM = 0.78;

/** Width of `text` in Inter ExtraBold, in em, with `letterSpacingEm` added after every glyph. */
export const measureInterBold = (text: string, letterSpacingEm = 0): number => {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    width += (ASCII_WIDTHS[code - ASCII_FIRST] ?? FALLBACK_WIDTH_EM) + letterSpacingEm;
  }
  return width;
};
