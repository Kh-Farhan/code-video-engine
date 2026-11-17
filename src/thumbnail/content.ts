import { normalizeCode } from "../components/codeLayout";
import type { CodeLanguage, CodeScene, Script } from "../schema/script";
import { splitWords } from "./fitText";

/**
 * What the thumbnail shows, read from a script. Pure, so the CLI and tests
 * can use it without a browser.
 */

/** A candidate longer than this is never used whole, even if it would fit. */
export const HEADLINE_MAX_WORDS = 10;
/** Length a too-long script title is shortened to. */
const HEADLINE_CUT_WORDS = 6;

const trimPunctuation = (s: string) => s.trim().replace(/[\s,.;:]+$/, "");

/**
 * Headline options in order of preference: `meta.thumbnail`, the title scene
 * heading, the script title, each as written; last, the script title
 * shortened to its first clause or first six words. A heading is never cut:
 * it is usually a setup and a payoff ("Click user 2. The page shows user
 * 1."), and the setup alone says nothing about the video.
 */
export const headlineCandidates = (script: Script): string[] => {
  const title = script.scenes.find((s) => s.type === "title");
  const whole = [script.meta?.thumbnail, title?.heading, script.title]
    .filter((c): c is string => Boolean(c))
    .map((c) => splitWords(trimPunctuation(c)).join(" "))
    .filter((c) => splitWords(c).length <= HEADLINE_MAX_WORDS);

  const fallback = trimPunctuation(script.title);
  const clause = fallback.split(/[:;,.!?]\s|\s-\s/)[0];
  const clauseWords = clause ? splitWords(trimPunctuation(clause)) : [];
  const shortened =
    clauseWords.length >= 2 && clauseWords.length <= HEADLINE_CUT_WORDS
      ? clauseWords.join(" ")
      : trimPunctuation(splitWords(fallback).slice(0, HEADLINE_CUT_WORDS).join(" "));
  return [...new Set([...whole, shortened])];
};

/**
 * The thumbnail headline: the first candidate that `fits` (by default the
 * first one), else the shortened script title.
 */
export const headlineFromScript = (script: Script, fits: (text: string) => boolean = () => true): string => {
  const candidates = headlineCandidates(script);
  return candidates.find(fits) ?? candidates[candidates.length - 1]!;
};

/** The title scene's subheading, cut at its first clause so it reads as a tag. */
export const tagFromScript = (script: Script): string | undefined => {
  const title = script.scenes.find((s) => s.type === "title");
  const subheading = title?.type === "title" ? title.subheading : undefined;
  if (!subheading) return undefined;
  const clause = trimPunctuation(subheading.split(/[,;:!?]\s|\.\s/)[0] ?? subheading);
  return splitWords(clause).length >= 2 ? clause : trimPunctuation(subheading);
};

export type CodeSnippet = {
  language: CodeLanguage;
  /** The scene's whole code, normalized, so it can be tokenized with full context. */
  code: string;
  /** 0-based first line shown (inclusive). */
  start: number;
  /** 0-based last line shown (exclusive). */
  end: number;
  /** Leading spaces removed from every shown line. */
  indent: number;
  /** 0-based lines to highlight: the first highlight step, where it is shown. */
  highlighted: number[];
};

/**
 * Up to `maxLines` of the first code scene. Centers on the first highlight
 * step when it is set (one line of context above it), otherwise starts at
 * the top. The shared indentation is removed so the crop shows code, not
 * whitespace.
 */
export const snippetFromScript = (script: Script, maxLines: number): CodeSnippet | undefined => {
  const scene = script.scenes.find((s): s is CodeScene => s.type === "code");
  if (!scene) return undefined;
  const code = normalizeCode(scene.code);
  const lines = code.split("\n");
  const focus = scene.highlight?.[0];

  let start = 0;
  if (focus && focus.to > maxLines) start = Math.max(0, focus.from - 2);
  while (start < lines.length - 1 && lines[start]!.trim() === "") start++;
  let end = Math.min(lines.length, start + maxLines);
  while (end > start + 1 && lines[end - 1]!.trim() === "") end--;

  const shown = lines.slice(start, end).filter((l) => l.trim() !== "");
  const indent = Math.min(...shown.map((l) => l.length - l.trimStart().length));

  const highlighted: number[] = [];
  if (focus) {
    for (let line = focus.from - 1; line < focus.to; line++) {
      if (line >= start && line < end) highlighted.push(line);
    }
  }
  return { language: scene.language, code, start, end, indent, highlighted };
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "but", "for", "how", "in", "is", "it", "not", "of", "on", "or",
  "the", "to", "use", "vs", "what", "when", "why", "with", "you", "your",
]);

const bare = (word: string) => word.replace(/^[^\w@#$]+|[^\w]+$/g, "");

/**
 * Index of the headline word drawn in the accent color: the first one that
 * also appears in the code (usually an API name like useMemo), otherwise the
 * last word.
 */
export const accentWordIndex = (headline: string, code?: string): number => {
  const words = splitWords(headline);
  if (code) {
    const identifiers = new Set(code.match(/[A-Za-z_$][\w$]*/g) ?? []);
    const index = words.findIndex((w) => {
      const b = bare(w);
      return b.length >= 3 && !STOP_WORDS.has(b.toLowerCase()) && identifiers.has(b);
    });
    if (index >= 0) return index;
  }
  return words.length - 1;
};
