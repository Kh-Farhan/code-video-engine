import {
  createTikTokStyleCaptions,
  type Caption,
  type TikTokPage,
  type TikTokToken,
} from "@remotion/captions";
import type { ManifestScene } from "../schema/manifest";
import { popCaptionLines, popWordWidth, POP_WORD_MAX_SCALE } from "./layout";
import { chunksFromManifestCaptions } from "./scene";
import type { TimedWord } from "./types";

export type { Caption, TikTokPage, TikTokToken };

/** Most words on one caption page. */
export const MAX_PAGE_WORDS = 3;
/**
 * Passed to createTikTokStyleCaptions: a page takes words until it spans more
 * than this, which gives about 2 to 3 words at normal speaking pace. Pages
 * over MAX_PAGE_WORDS are split afterwards.
 */
export const PAGE_COMBINE_MS = 800;

/** Words after which a new page always starts (end of a sentence). */
const SENTENCE_END = /[.!?]["')\]]*$/;

const frameToMs = (frame: number, fps: number): number => (frame * 1000) / fps;

/**
 * Word timings (frames) as @remotion/captions Captions (ms). Every word but
 * the first gets a leading space, which is where createTikTokStyleCaptions
 * may start a new page; sentence ends force one.
 */
export const wordsToCaptions = (words: readonly TimedWord[], fps: number): Caption[] =>
  words.map((w, i) => {
    const startMs = frameToMs(w.startFrame, fps);
    const endMs = frameToMs(w.endFrame, fps);
    return {
      text: i === 0 ? w.text : ` ${w.text}`,
      startMs,
      endMs,
      timestampMs: (startMs + endMs) / 2,
      confidence: null,
      ...(SENTENCE_END.test(w.text) ? { pageBreakAfter: true } : {}),
    };
  });

/**
 * A scene's captions as Caption[]. Uses the manifest's per-word Captions
 * (aligned from the audio, or estimated) when it has them. Older manifests
 * without them fall back to the estimated word timings the caption chunks
 * use, in the same shape. Either way, sentence ends force a page break.
 */
export const sceneCaptions = (
  entry: Pick<ManifestScene, "captions" | "words">,
  fps: number,
): Caption[] => {
  if (entry.words && entry.words.captions.length > 0) {
    return entry.words.captions
      .filter((c) => c.text.trim().length > 0)
      .map((c, i) => {
        const word = c.text.trim();
        return {
          ...c,
          text: i === 0 ? word : ` ${word}`,
          ...(c.pageBreakAfter || SENTENCE_END.test(word) ? { pageBreakAfter: true } : {}),
        };
      });
  }
  return wordsToCaptions(
    chunksFromManifestCaptions(entry.captions).flatMap((c) => c.words),
    fps,
  );
};

/** Captions (ms) back to word timings (frames), for the "box" style and SRT. */
export const captionsToWords = (captions: readonly Caption[], fps: number): TimedWord[] =>
  captions
    .map((c) => ({
      text: c.text.trim(),
      startFrame: Math.round((c.startMs * fps) / 1000),
      endFrame: Math.round((c.endMs * fps) / 1000),
    }))
    .filter((w) => w.text.length > 0);

/** Sizes for splitting `n` words into the fewest pages of at most `max`, as even as possible. */
const evenSizes = (n: number, max: number): number[] => {
  const count = Math.ceil(n / max);
  const base = Math.floor(n / count);
  return Array.from({ length: count }, (_, i) => base + (i < n % count ? 1 : 0));
};

const pageText = (tokens: readonly TikTokToken[]): string =>
  tokens.map((t) => t.text).join("").trimStart();

/** Splits a page with too many words into even pages that change on word starts. */
const splitPage = (page: TikTokPage, max: number): TikTokPage[] => {
  if (page.tokens.length <= max) return [page];
  const end = page.startMs + page.durationMs;
  const parts: TikTokToken[][] = [];
  let at = 0;
  for (const size of evenSizes(page.tokens.length, max)) {
    parts.push(page.tokens.slice(at, at + size));
    at += size;
  }
  return parts.map((tokens, i) => {
    const startMs = i === 0 ? page.startMs : tokens[0]!.fromMs;
    const next = parts[i + 1];
    const endMs = next ? next[0]!.fromMs : end;
    return { text: pageText(tokens), startMs, durationMs: endMs - startMs, tokens };
  });
};

export type PageOptions = {
  maxWords?: number;
  combineTokensWithinMilliseconds?: number;
};

/**
 * Groups captions into pages of 1 to `maxWords` words with
 * createTikTokStyleCaptions. A page stays up until the next one starts, so
 * pages only change when a word starts.
 */
export const captionPages = (
  captions: readonly Caption[],
  {
    maxWords = MAX_PAGE_WORDS,
    combineTokensWithinMilliseconds = PAGE_COMBINE_MS,
  }: PageOptions = {},
): TikTokPage[] => {
  if (maxWords < 1) throw new Error(`maxWords must be at least 1, got ${maxWords}`);
  const { pages } = createTikTokStyleCaptions({
    captions: [...captions],
    combineTokensWithinMilliseconds,
  });
  return pages.filter((p) => p.tokens.length > 0).flatMap((p) => splitPage(p, maxWords));
};

/** The page on screen at `ms`, if any. */
export const activePageAt = (pages: readonly TikTokPage[], ms: number): TikTokPage | undefined =>
  pages.find((p) => ms >= p.startMs && ms < p.startMs + p.durationMs);

/**
 * Index of the active word in `page` at `ms`: the last word that has started.
 * It stays active through a short pause after it, so the highlight never
 * blinks off between words. -1 before the first word starts.
 */
export const activeTokenIndexAt = (page: TikTokPage, ms: number): number => {
  let active = -1;
  page.tokens.forEach((t, i) => {
    if (t.fromMs <= ms) active = i;
  });
  return active;
};

/** Kerning and rounding margin: fitted text uses at most this share of the width. */
const WIDTH_SAFETY = 0.94;

/**
 * Largest font size, from `max` down to `min`, at which the words fit
 * `maxLines` lines of `maxWidth` with room for the spoken word's pop (same
 * line breaking as the renderer, popCaptionLines).
 */
export const fitPageFontSize = (
  words: readonly string[],
  { max, min, maxWidth, maxLines }: { max: number; min: number; maxWidth: number; maxLines: number },
): number => {
  const limit = maxWidth * WIDTH_SAFETY;
  for (let size = max; size > min; size -= 2) {
    const widest = Math.max(0, ...words.map((w) => popWordWidth(w, size) * POP_WORD_MAX_SCALE));
    if (widest <= limit && popCaptionLines(words, size, limit).length <= maxLines) return size;
  }
  return min;
};
