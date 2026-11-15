import { splitSentences } from "./sentences";
import { silentWav } from "./wav";
import type { SpokenSegment, TtsBackend } from "./types";

/** Average narration pace used to estimate how long text takes to say. */
export const MOCK_WORDS_PER_MINUTE = 150;

/** Very short lines still get enough time to be read on screen. */
export const MOCK_MIN_SECONDS = 0.5;

const MOCK_SAMPLE_RATE = 16000;

export const countWords = (text: string): number =>
  text.split(/\s+/).filter(Boolean).length;

export const estimateSpeechSeconds = (text: string, speakingRate = 1): number =>
  Math.max(
    MOCK_MIN_SECONDS,
    (countWords(text) / (MOCK_WORDS_PER_MINUTE * speakingRate)) * 60,
  );

/**
 * Sentence spans for mock audio: the estimated length shared out by word
 * count, back to back, like a provider that times every sentence.
 */
export const mockSegments = (text: string, totalSeconds: number): SpokenSegment[] => {
  const sentences = splitSentences(text);
  const weights = sentences.map((s) => Math.max(1, countWords(s)));
  const total = weights.reduce((a, b) => a + b, 0);
  let at = 0;
  return sentences.map((sentence, i) => {
    const startSeconds = at;
    at = i === sentences.length - 1 ? totalSeconds : at + (totalSeconds * weights[i]!) / total;
    return { text: sentence, startSeconds, endSeconds: at };
  });
};

/**
 * Offline provider: writes silent WAV audio whose length is estimated from
 * word count. Needs no network and no keys, so tests and CI use it.
 */
export const createMockBackend = (): TtsBackend => ({
  name: "mock",
  defaultVoiceId: "mock",
  extension: "wav",
  cacheIdentity: {
    wpm: MOCK_WORDS_PER_MINUTE,
    minSeconds: MOCK_MIN_SECONDS,
    sampleRate: MOCK_SAMPLE_RATE,
    segments: 1,
  },
  async generate(text, { speakingRate }) {
    const seconds = estimateSpeechSeconds(text, speakingRate);
    const samples = Math.max(1, Math.round(seconds * MOCK_SAMPLE_RATE));
    return {
      data: silentWav(seconds, MOCK_SAMPLE_RATE),
      segments: mockSegments(text, samples / MOCK_SAMPLE_RATE),
    };
  },
});
