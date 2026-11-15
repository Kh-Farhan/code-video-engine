/**
 * Builds the text for one continuous narration pass and splits it at
 * sentence boundaries when a provider limits input length. Pure.
 */

const SENTENCE_END = /[.!?…]["')\]]*$/;

/** Scene narration with closing punctuation, so scenes never run together when joined. */
export const ensureSentenceEnd = (text: string): string => {
  const t = text.replace(/\s+/g, " ").trim();
  return !t || SENTENCE_END.test(t) ? t : `${t}.`;
};

/** The whole script as one text: every scene's narration in order. */
export const joinNarration = (narrations: readonly string[]): string =>
  narrations.map(ensureSentenceEnd).filter(Boolean).join(" ");

/** Splits after ., !, ? or … (and any closing quote or bracket) followed by whitespace. */
export const splitSentences = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…]["')\]]*)\s+/)
    .filter(Boolean);

/**
 * Packs whole sentences into chunks of at most `maxChars` characters. A
 * sentence longer than the limit becomes a chunk of its own: text is never
 * cut inside a sentence. Without a limit the text is one chunk.
 */
export const chunkAtSentences = (text: string, maxChars?: number): string[] => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (maxChars === undefined || clean.length <= maxChars) return [clean];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of splitSentences(clean)) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (current && next.length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};
