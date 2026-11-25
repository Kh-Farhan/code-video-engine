import { splitWords } from "../captions/text";
import { stripPauseMarkers } from "../schema/pauses";
import type { Script } from "../schema/script";
import { endsClause, endsQuestion, endsSentence, pauseMarkerPositions } from "../tts/pauses";

/**
 * Narration linter for `validate`: finds sentences a TTS voice will read in
 * one breath. Warnings only, never errors. Pure.
 */

/** Longest sentence that may go without a comma or marker. */
export const LINT_MAX_WORDS_WITHOUT_COMMA = 16;
/** Sentences longer than this need a pause before a clause word. */
export const LINT_CLAUSE_CHECK_MIN_WORDS = 10;
/** Words that usually start a new clause, so the voice should breathe before them. */
/** Longest question that still gets read with question intonation. */
export const LINT_MAX_QUESTION_WORDS = 10;
/** The example in every long-question warning. */
export const SHORT_QUESTION_EXAMPLE = {
  from: "So what does this code log to the console?",
  to: "So, does it log one, or three?",
} as const;
export const CLAUSE_WORDS = ["then", "so", "but", "which", "because", "instead"] as const;
/**
 * Words that lead into a clause word ("and then", "in which"): the pause
 * belongs before them, not between them and the clause word.
 */
const LEAD_INS = new Set(["and", "or", "in", "of", "on", "at", "by", "for", "from", "with", "to", "about", "into"]);
/** Clause words that are not a clause when followed by this word ("instead of"). */
const NOT_A_CLAUSE_BEFORE: Record<string, RegExp> = { instead: /^of\b/i };
/** ...or when they follow this word ("everyone but admins" means except). */
const NOT_A_CLAUSE_AFTER: Record<string, RegExp> = {
  but: /^(all|everyone|everybody|everything|anyone|anybody|anything|nothing|nobody|none|last)$/,
};

export type NarrationWarning = {
  /** 0-based scene index. */
  scene: number;
  sceneType: string;
  rule:
    | "long-sentence"
    | "clause-word"
    | "long-question"
    | "split-question"
    | "short-sentence"
    | "echoes-screen"
    | "fragment-run";
  /** The words in question, exactly as narrated. */
  phrase: string;
  /** The same phrase with the fix applied, or advice when no single fix fits. */
  suggestion: string;
  message: string;
};

/** Statements this short read as fragments. Short questions ("Ready?") are fine. */
export const LINT_MAX_FRAGMENT_WORDS = 3;
/** A narration sentence this similar to the scene's on-screen text just reads the screen aloud. */
export const LINT_ECHO_SIMILARITY = 0.8;
/** This many sentences in a row, each under LINT_CHOPPY_WORDS words, sound choppy. */
export const LINT_CHOPPY_RUN = 3;
export const LINT_CHOPPY_WORDS = 5;

const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

type Sentence = {
  words: string[];
  /** pause (comma or marker) after word i */
  breakAfter: boolean[];
  /** a [pause] marker after word i */
  markerAfter: boolean[];
};

const sentencesOf = (narration: string): Sentence[] => {
  const words = splitWords(narration);
  const marked = new Set(pauseMarkerPositions(narration).map((m) => m.afterWord));
  const out: Sentence[] = [];
  const empty = (): Sentence => ({ words: [], breakAfter: [], markerAfter: [] });
  let current = empty();
  words.forEach((w, i) => {
    current.words.push(w);
    current.breakAfter.push(endsClause(w) || marked.has(i));
    current.markerAfter.push(marked.has(i));
    if (endsSentence(w) || i === words.length - 1) {
      out.push(current);
      current = empty();
    }
  });
  return out;
};

const quote = (words: readonly string[]) => `"${words.join(" ")}"`;

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

/** Lowercase letters and digits only, small numbers spelled out, so "5 times" matches "five times". */
export const normalizeForEcho = (text: string): string =>
  stripPauseMarkers(text)
    .toLowerCase()
    .replace(/\b(\d+)\b/g, (d) => NUMBER_WORDS[Number(d)] ?? d)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const levenshtein = (a: string, b: string): number => {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row.push(Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = row;
  }
  return prev[b.length]!;
};

/** 0 to 1: how close two strings are after normalizeForEcho (1 is identical). */
export const echoSimilarity = (a: string, b: string): number => {
  const x = normalizeForEcho(a);
  const y = normalizeForEcho(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 0;
  return 1 - levenshtein(x, y) / longest;
};

/** The words a scene puts on screen as a heading, keyword or text: the whole and each sentence. */
const screenTexts = (scene: Script["scenes"][number]): string[] => {
  const shown =
    scene.type === "title" ? scene.heading : scene.type === "keyword" ? scene.keyword : scene.type === "text" ? scene.text : undefined;
  if (!shown) return [];
  const parts = shown.split(/(?<=[.!?])\s+/).filter((p) => normalizeForEcho(p).length > 0);
  return parts.length > 1 ? [shown, ...parts] : [shown];
};

/** Warnings for one scene's narration. `onScreen` is the heading, keyword or text the scene shows. */
export const lintNarration = (
  narration: string,
  scene = 0,
  sceneType = "scene",
  onScreen: readonly string[] = [],
): NarrationWarning[] => {
  const warnings: NarrationWarning[] = [];
  const label = `scene ${scene + 1} (${sceneType})`;
  const sentences = sentencesOf(narration);

  // Runs of very short sentences ("New user. Old draft. Same state.").
  const inRun = new Set<number>();
  for (let i = 0; i < sentences.length; ) {
    let j = i;
    while (j < sentences.length && sentences[j]!.words.length < LINT_CHOPPY_WORDS) j++;
    if (j - i >= LINT_CHOPPY_RUN) {
      for (let k = i; k < j; k++) inRun.add(k);
      const phrase = sentences.slice(i, j).map((s) => s.words.join(" ")).join(" ");
      const suggestion = 'join them into one or two complete sentences with a subject and a verb, e.g. "Same spot. Same state." becomes "Same spot in the tree means the same state."';
      warnings.push({
        scene,
        sceneType,
        rule: "fragment-run",
        phrase,
        suggestion,
        message: `${label}: ${j - i} short sentences in a row sound choppy: "${phrase}". Suggest: ${suggestion}`,
      });
    }
    i = Math.max(j, i + 1);
  }

  sentences.forEach((s, index) => {
    const n = s.words.length;
    const internalBreak = s.breakAfter.slice(0, -1).some(Boolean);

    // Questions: TTS voices lose the question intonation over a long one,
    // and wh-questions ("what does it log?") fall at the end even when spoken
    // by a person. Short yes/no or either/or questions rise.
    if (endsQuestion(s.words[n - 1]!)) {
      if (n > LINT_MAX_QUESTION_WORDS) {
        const suggestion = `rephrase as a yes/no or either/or question of ${LINT_MAX_QUESTION_WORDS} words or fewer, e.g. "${SHORT_QUESTION_EXAMPLE.from}" becomes "${SHORT_QUESTION_EXAMPLE.to}"`;
        warnings.push({
          scene,
          sceneType,
          rule: "long-question",
          phrase: s.words.join(" "),
          suggestion,
          message: `${label}: ${n}-word question: ${quote(s.words)}. Questions over ${LINT_MAX_QUESTION_WORDS} words are read like statements. Suggest: ${suggestion}`,
        });
      }
      if (s.markerAfter.slice(0, -1).some(Boolean)) {
        const suggestion = "move the [pause] before or after the question, or use a comma inside it";
        warnings.push({
          scene,
          sceneType,
          rule: "split-question",
          phrase: s.words.join(" "),
          suggestion,
          message: `${label}: a [pause] marker splits the question ${quote(s.words)}, so the voice reads the part before it as a statement. Suggest: ${suggestion}`,
        });
      }
    }

    // Clause words with no pause before them (or before their lead-in).
    const clauseHits: { at: number; word: string }[] = [];
    if (n > LINT_CLAUSE_CHECK_MIN_WORDS) {
      // The last word ends the sentence ("looks done instead."), it starts nothing.
      for (let i = 1; i < n - 1; i++) {
        const word = bare(s.words[i]!);
        if (!(CLAUSE_WORDS as readonly string[]).includes(word)) continue;
        if (NOT_A_CLAUSE_BEFORE[word]?.test(s.words[i + 1]!)) continue;
        if (NOT_A_CLAUSE_AFTER[word]?.test(bare(s.words[i - 1]!))) continue;
        let at = i;
        while (at > 0 && LEAD_INS.has(bare(s.words[at - 1]!)) && (at === 1 || !s.breakAfter[at - 2])) at--;
        if (at === 0 || s.breakAfter[at - 1]) continue;
        clauseHits.push({ at, word });
      }
    }
    for (const { at, word } of clauseHits) {
      const from = Math.max(0, at - 3);
      const to = Math.min(n, at + 3);
      const phrase = s.words.slice(from, to);
      const fixed = s.words.slice(from, to).map((w, k) => (from + k === at - 1 ? `${w},` : w));
      warnings.push({
        scene,
        sceneType,
        rule: "clause-word",
        phrase: phrase.join(" "),
        suggestion: fixed.join(" "),
        message: `${label}: no pause before "${word}" in a ${n}-word sentence: ${quote(phrase)}. Suggest: ${quote(fixed)} (or [pause] if a comma reads wrong)`,
      });
    }

    if (n > LINT_MAX_WORDS_WITHOUT_COMMA && !internalBreak) {
      const hint = clauseHits[0];
      const suggestion = hint
        ? `add a comma before "${s.words[hint.at]}", or split it into two sentences`
        : "split it into two sentences, or add a comma or [pause] at the natural break";
      warnings.push({
        scene,
        sceneType,
        rule: "long-sentence",
        phrase: s.words.join(" "),
        suggestion,
        message: `${label}: ${n}-word sentence with no comma: ${quote(s.words)}. Suggest: ${suggestion}`,
      });
    }

    // Fragments: a statement of 3 words or fewer. Short questions are fine.
    // (A fragment inside a reported run is already covered by that warning.)
    if (n <= LINT_MAX_FRAGMENT_WORDS && !endsQuestion(s.words[n - 1]!) && !inRun.has(index)) {
      const suggestion = 'make it a complete sentence with a subject and a verb, or join it to its neighbour, e.g. "Fifteen has it. Sixteen doesn\'t." becomes "Next.js 15 has it, but 16 doesn\'t."';
      warnings.push({
        scene,
        sceneType,
        rule: "short-sentence",
        phrase: s.words.join(" "),
        suggestion,
        message: `${label}: ${n}-word sentence reads as a fragment: ${quote(s.words)}. Suggest: ${suggestion}`,
      });
    }

    // Reading the screen aloud: captions and the visual already say it.
    const spoken = s.words.join(" ");
    const echoed = onScreen.find((t) => echoSimilarity(spoken, t) >= LINT_ECHO_SIMILARITY);
    if (echoed !== undefined) {
      const suggestion = "say the idea in your own complete sentence instead of reading the on-screen words aloud";
      warnings.push({
        scene,
        sceneType,
        rule: "echoes-screen",
        phrase: spoken,
        suggestion,
        message: `${label}: ${quote(s.words)} repeats the on-screen "${echoed}" (${Math.round(echoSimilarity(spoken, echoed) * 100)}% the same). Suggest: ${suggestion}`,
      });
    }
  });
  return warnings;
};

/** Warnings for every scene, in order. */
export const lintScript = (script: Pick<Script, "scenes">): NarrationWarning[] =>
  script.scenes.flatMap((s, i) => lintNarration(s.narration, i, s.type, screenTexts(s)));
