import type { Caption } from "@remotion/captions";
import { toCaptions, type TranscriptionJson } from "@remotion/install-whisper-cpp";
import type { HeardWord } from "./match";

/** Markers whisper.cpp emits for non-speech, e.g. "[BLANK_AUDIO]", "[_TT_42]", "(music)". */
const NON_SPEECH = /^(\[.*\]|\(.*\)|\*.*\*)$/;

/**
 * Joins Whisper token captions into words. With token-level timestamps every
 * caption is one token; a token whose text starts with a space begins a new
 * word, anything else ("Effect" after " use") continues the previous one.
 */
export const tokensToWords = (tokens: readonly Caption[]): HeardWord[] => {
  const words: HeardWord[] = [];
  let current: HeardWord | undefined;
  for (const token of tokens) {
    const text = token.text;
    if (!text.trim()) continue;
    const startsWord = !current || /^\s/.test(text);
    if (startsWord) {
      current = {
        text: text.trim(),
        startMs: token.startMs,
        endMs: token.endMs,
        timestampMs: token.timestampMs,
        confidence: token.confidence,
      };
      words.push(current);
    } else {
      current!.text += text;
      current!.endMs = Math.max(current!.endMs, token.endMs);
      if (token.confidence != null) {
        current!.confidence = Math.min(current!.confidence ?? 1, token.confidence);
      }
    }
  }
  return words
    .filter((w) => !NON_SPEECH.test(w.text))
    .map((w) => ({ ...w, endMs: Math.max(w.startMs, w.endMs) }));
};

/** Words with timings from whisper.cpp JSON produced with token-level timestamps. */
export const whisperJsonToWords = (json: TranscriptionJson<true>): HeardWord[] =>
  tokensToWords(
    toCaptions({
      // toCaptions reads tokens[0] of every item, so drop items without tokens.
      whisperCppOutput: { ...json, transcription: json.transcription.filter((t) => t.tokens.length > 0) },
    }).captions,
  );
