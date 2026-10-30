import { DEFAULT_CACHE_DIR, withCache } from "./cache";
import { createElevenLabsBackend, type ElevenLabsConfig } from "./elevenlabs";
import { createGeminiBackend, type GeminiConfig } from "./gemini";
import { createMockBackend } from "./mock";
import { TtsError, ttsProviderNames, type Env, type TtsProvider, type TtsProviderName } from "./types";

export * from "./types";
export { cacheKey, DEFAULT_CACHE_DIR, withCache } from "./cache";
export { audioDurationFromBytes, measureAudioDuration } from "./duration";
export { countWords, estimateSpeechSeconds, MOCK_WORDS_PER_MINUTE } from "./mock";
export { ELEVENLABS_API_KEY_ENV, type ElevenLabsConfig } from "./elevenlabs";
export { GEMINI_API_KEY_ENV, type GeminiConfig } from "./gemini";

export type CreateTtsProviderOptions = {
  /** Where generated audio is stored and reused. Default public/audio/tts-cache. */
  cacheDir?: string;
  env?: Env;
  fetch?: typeof fetch;
  elevenlabs?: Omit<ElevenLabsConfig, "env" | "fetch">;
  gemini?: Omit<GeminiConfig, "env" | "fetch">;
};

export const isTtsProviderName = (value: string): value is TtsProviderName =>
  (ttsProviderNames as readonly string[]).includes(value);

/**
 * Creates a cached provider by name. API keys are read lazily, on the first
 * call that is not a cache hit, so a missing key fails with a clear message
 * only when the API would actually be called.
 */
export const createTtsProvider = (
  name: string,
  options: CreateTtsProviderOptions = {},
): TtsProvider => {
  const { cacheDir = DEFAULT_CACHE_DIR, env, fetch } = options;
  switch (name) {
    case "mock":
      return withCache(createMockBackend(), cacheDir);
    case "elevenlabs":
      return withCache(createElevenLabsBackend({ ...options.elevenlabs, env, fetch }), cacheDir);
    case "gemini":
      return withCache(createGeminiBackend({ ...options.gemini, env, fetch }), cacheDir);
    default:
      throw new TtsError(
        `Unknown TTS provider "${name}". Use one of: ${ttsProviderNames.join(", ")}.`,
      );
  }
};
