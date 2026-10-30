/**
 * Provider-agnostic TTS contract. The CLI only talks to `TtsProvider`;
 * which backend produced the audio is a detail of the adapter.
 */

export const ttsProviderNames = ["mock", "elevenlabs", "gemini"] as const;
export type TtsProviderName = (typeof ttsProviderNames)[number];

export type SynthesizeOptions = {
  /** Provider-specific voice id. Falls back to the provider's default voice. */
  voiceId?: string;
  /** 1 is normal speed, below 1 is slower, above 1 is faster. */
  speakingRate?: number;
};

export type SynthesisResult = {
  /** Absolute path of the generated audio file. */
  path: string;
  /** Real duration of the file, measured from its contents. */
  durationSeconds: number;
  /** True when the file came from the cache and no generation happened. */
  cached: boolean;
};

export interface TtsProvider {
  readonly name: TtsProviderName;
  readonly defaultVoiceId: string;
  synthesize(text: string, options?: SynthesizeOptions): Promise<SynthesisResult>;
}

/** Raw audio produced by a backend before it is cached and measured. */
export type GeneratedAudio = {
  data: Uint8Array;
};

/**
 * What an adapter has to supply. Caching, file writing and duration
 * measurement are shared (see cache.ts).
 */
export type TtsBackend = {
  name: TtsProviderName;
  defaultVoiceId: string;
  /** File extension of everything this backend produces. */
  extension: "wav" | "mp3";
  /**
   * Settings that change the output besides text, voice and rate
   * (model id, output format, style). Part of the cache key.
   */
  cacheIdentity: Record<string, string | number | undefined>;
  generate(
    text: string,
    options: { voiceId: string; speakingRate: number },
  ): Promise<GeneratedAudio>;
};

export class TtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsError";
  }
}

export type Env = Record<string, string | undefined>;

/** Reads a required API key, failing with a message that says how to fix it. */
export const requireApiKey = (
  env: Env,
  varName: string,
  provider: TtsProviderName,
): string => {
  const value = env[varName]?.trim();
  if (!value) {
    throw new TtsError(
      `${provider}: ${varName} is not set. Export it in your shell or .env, or use --provider mock.`,
    );
  }
  return value;
};

/** Validates input shared by every provider. */
export const normalizeRequest = (
  text: string,
  options: SynthesizeOptions | undefined,
  defaultVoiceId: string,
): { text: string; voiceId: string; speakingRate: number } => {
  const trimmed = text.trim();
  if (!trimmed) throw new TtsError("Cannot synthesize empty text.");
  const speakingRate = options?.speakingRate ?? 1;
  if (!Number.isFinite(speakingRate) || speakingRate <= 0) {
    throw new TtsError(`speakingRate must be a positive number, got ${speakingRate}.`);
  }
  const voiceId = options?.voiceId?.trim() || defaultVoiceId;
  return { text: trimmed, voiceId, speakingRate };
};
