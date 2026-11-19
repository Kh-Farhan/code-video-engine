import type { TtsProvider } from "./types";

/**
 * --debug-tts: wraps a provider so every request is logged with the exact
 * text sent (after the shared trim), the voice and speed, and whether it came
 * from the cache. A question shows up as a request whose text ends in "?".
 */
export const withTtsDebug = (provider: TtsProvider, log: (message: string) => void): TtsProvider => {
  let n = 0;
  return {
    name: provider.name,
    defaultVoiceId: provider.defaultVoiceId,
    ...(provider.maxInputChars !== undefined ? { maxInputChars: provider.maxInputChars } : {}),
    ...(provider.questionChunks ? { questionChunks: true } : {}),
    async synthesize(text, options) {
      const k = ++n;
      const voice = options?.voiceId?.trim() || provider.defaultVoiceId;
      log(
        `tts request ${k} -> ${provider.name} (voice ${voice}, speed ${options?.speakingRate ?? 1}): ${JSON.stringify(text.trim())}`,
      );
      const result = await provider.synthesize(text, options);
      log(
        `tts request ${k}: ${result.durationSeconds.toFixed(2)}s ${result.cached ? "from cache (not sent to the model again)" : "generated"}`,
      );
      return result;
    },
  };
};
