/**
 * Text normalization for matching script words against transcribed words.
 * Both sides go through the same function, so whether Whisper writes "2" or
 * "two", "useEffect" or "use effect", "Array.isArray" or "array is array",
 * they reduce to the same letters. Pure: safe to import from the Remotion
 * bundle.
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const belowThousand = (n: number): string[] => {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) words.push(ONES[hundreds]!, "hundred");
  if (rest >= 20) {
    words.push(TENS[Math.floor(rest / 10)]!);
    if (rest % 10) words.push(ONES[rest % 10]!);
  } else if (rest > 0 || hundreds === 0) {
    words.push(ONES[rest]!);
  }
  return words;
};

const SCALES = ["", "thousand", "million", "billion"];

/**
 * Spoken form of a non-negative integer written in digits, e.g. "42" ->
 * "forty two". Numbers too long to read as one (over 12 digits) are read
 * digit by digit.
 */
export const integerToWords = (digits: string): string => {
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  if (trimmed.length > 12) return [...digits].map((d) => ONES[Number(d)]).join(" ");
  let n = Number(trimmed);
  if (n === 0) return "zero";
  const groups: string[] = [];
  for (let scale = 0; n > 0; scale++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) groups.unshift([...belowThousand(chunk), SCALES[scale]].filter(Boolean).join(" "));
  }
  return groups.join(" ");
};

/** "3.14" -> "three point one four"; "1,000" -> "one thousand". */
const numberToWords = (raw: string): string => {
  const [whole = "", fraction] = raw.replace(/,/g, "").split(".");
  const head = whole ? integerToWords(whole) : "";
  if (!fraction) return head;
  return [head, "point", ...[...fraction].map((d) => ONES[Number(d)])].filter(Boolean).join(" ");
};

/** Symbols that are read aloud, padded with spaces so they become words. */
const SPOKEN_SYMBOLS: [RegExp, string][] = [
  [/%/g, " percent "],
  [/&/g, " and "],
  [/\+/g, " plus "],
  [/@/g, " at "],
];

/**
 * Reduces text to lowercase letters and digits spelled out, with no spaces:
 * "Array.isArray()" -> "arrayisarray", "React 19" -> "reactnineteen",
 * "$5" -> "fivedollars". Empty when nothing in the text is spoken.
 */
export const normalizeForMatch = (text: string): string => {
  let s = text.normalize("NFKD").replace(/\p{M}/gu, "");
  // "$5" is said "five dollars".
  s = s.replace(/\$(\d[\d,]*(?:\.\d+)?)/g, "$1 dollars ");
  for (const [pattern, spoken] of SPOKEN_SYMBOLS) s = s.replace(pattern, spoken);
  s = s.replace(/\d[\d,]*(?:\.\d+)?/g, (n) => ` ${numberToWords(n.replace(/,$/, ""))} `);
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
};
