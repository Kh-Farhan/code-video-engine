import { requireApiKey, TtsError, type Env, type TtsBackend } from "./types";

/**
 * ElevenLabs text to speech.
 *
 * API: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=...
 * Auth header `xi-api-key`. JSON body `{ text, model_id, voice_settings }`,
 * where `voice_settings.speed` is 1.0 by default (lower is slower).
 * Response body is the audio file. Taken from the official SDK, which is
 * generated from the ElevenLabs API definition.
 *
 * Untested against the live API.
 */

export const ELEVENLABS_API_KEY_ENV = "ELEVENLABS_API_KEY";

export type ElevenLabsConfig = {
  /** Default "eleven_multilingual_v2". */
  modelId?: string;
  /** Default voice when a scene does not set one. Default "JBFqnCBsd6RMkjVDRZzb" (George). */
  defaultVoiceId?: string;
  /** Must be an mp3_* format; the cache stores .mp3. Default "mp3_44100_128". */
  outputFormat?: `mp3_${string}`;
  baseUrl?: string;
  env?: Env;
  fetch?: typeof fetch;
};

export const createElevenLabsBackend = (config: ElevenLabsConfig = {}): TtsBackend => {
  const modelId = config.modelId ?? "eleven_multilingual_v2";
  const outputFormat = config.outputFormat ?? "mp3_44100_128";
  const baseUrl = (config.baseUrl ?? "https://api.elevenlabs.io").replace(/\/$/, "");
  const env = config.env ?? process.env;
  const doFetch = config.fetch ?? fetch;

  return {
    name: "elevenlabs",
    defaultVoiceId: config.defaultVoiceId ?? "JBFqnCBsd6RMkjVDRZzb",
    extension: "mp3",
    cacheIdentity: { modelId, outputFormat },
    async generate(text, { voiceId, speakingRate }) {
      // Checked here, not at construction, so cached files work without a key.
      const apiKey = requireApiKey(env, ELEVENLABS_API_KEY_ENV, "elevenlabs");
      const url = `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
      const body: Record<string, unknown> = { text, model_id: modelId };
      // Only override stored voice settings when the caller asked for a non-default rate.
      if (speakingRate !== 1) body.voice_settings = { speed: speakingRate };

      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "content-type": "application/json",
            accept: "audio/mpeg",
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new TtsError(`elevenlabs: request failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 500);
        throw new TtsError(`elevenlabs: HTTP ${res.status} for voice "${voiceId}": ${detail}`);
      }
      const data = new Uint8Array(await res.arrayBuffer());
      if (data.byteLength === 0) throw new TtsError("elevenlabs: response contained no audio");
      return { data };
    },
  };
};
