import { splitWords } from "../captions/text";
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
  rule: "long-sentence" | "clause-word" | "long-question" | "split-question";
  /** The words in question, exactly as narrated. */
  phrase: string;
  /** The same phrase with the fix applied, or advice when no single fix fits. */
  suggestion: string;
  message: string;
};

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

/** Warnings for one scene's narration. */
export const lintNarration = (narration: string, scene = 0, sceneType = "scene"): NarrationWarning[] => {
  const warnings: NarrationWarning[] = [];
  const label = `scene ${scene + 1} (${sceneType})`;
  for (const s of sentencesOf(narration)) {
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
  }
  return warnings;
};

/** Warnings for every scene, in order. */
export const lintScript = (script: Pick<Script, "scenes">): NarrationWarning[] =>
  script.scenes.flatMap((s, i) => lintNarration(s.narration, i, s.type));
