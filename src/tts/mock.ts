import { silentWav } from "./wav";
import type { TtsBackend } from "./types";

/** Average narration pace used to estimate how long text takes to say. */
export const MOCK_WORDS_PER_MINUTE = 150;

/** Very short lines still get enough time to be read on screen. */
export const MOCK_MIN_SECONDS = 0.5;

export const countWords = (text: string): number =>
  text.split(/\s+/).filter(Boolean).length;

export const estimateSpeechSeconds = (text: string, speakingRate = 1): number =>
  Math.max(
    MOCK_MIN_SECONDS,
    (countWords(text) / (MOCK_WORDS_PER_MINUTE * speakingRate)) * 60,
  );

/**
 * Offline provider: writes silent WAV audio whose length is estimated from
 * word count. Needs no network and no keys, so tests and CI use it.
 */
export const createMockBackend = (): TtsBackend => ({
  name: "mock",
  defaultVoiceId: "mock",
  extension: "wav",
  cacheIdentity: { wpm: MOCK_WORDS_PER_MINUTE },
  async generate(text, { speakingRate }) {
    return { data: silentWav(estimateSpeechSeconds(text, speakingRate)) };
  },
});
