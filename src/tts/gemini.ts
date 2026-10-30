import { requireApiKey, TtsError, type Env, type TtsBackend } from "./types";
import { wrapPcmAsWav } from "./wav";

/**
 * Gemini (Google AI Studio) text to speech, via the Interactions API.
 *
 * API: POST https://generativelanguage.googleapis.com/v1beta/interactions
 * Auth header `x-goog-api-key`. Body:
 *   {
 *     model: "gemini-3.8-flash-tts",
 *     input: [{ type: "text", text, annotations: [{ type: "speech_metadata", style }] }],
 *     response_format: { type: "audio" },
 *     generation_config: { speech_config: [{ voice: "Kore" }] }
 *   }
 * Response: `output_audio.data` is base64 audio. Unary calls return a full WAV
 * (24 kHz, mono, 16-bit PCM); raw PCM is wrapped in a WAV header just in case.
 * Text is spoken verbatim, so delivery instructions (including pace) go in
 * the `speech_metadata` style, never in the text. There is no numeric rate
 * parameter, so `speakingRate` becomes a pacing hint.
 * Taken from the official google-genai SDK source and the Gemini cookbook.
 *
 * Untested against the live API.
 */

export const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

export type GeminiConfig = {
  /** Default "gemini-3.8-flash-tts". "gemini-3.8-flash-lite-tts" is the cheaper option. */
  model?: string;
  /** Prebuilt voice name (e.g. Kore, Puck, Charon) or a custom voice id. Default "Kore". */
  defaultVoiceId?: string;
  /** Delivery instructions sent as speech_metadata style. */
  style?: string;
  baseUrl?: string;
  /** Default "v1beta". */
  apiVersion?: string;
  env?: Env;
  fetch?: typeof fetch;
};

export const DEFAULT_GEMINI_STYLE =
  "Clear, friendly developer explainer narration. Confident and conversational.";

/** Gemini has no numeric speed control, so map the rate to words the model follows. */
export const pacingHint = (speakingRate: number): string | undefined => {
  if (speakingRate <= 0.8) return "Pace: slow and deliberate.";
  if (speakingRate < 0.95) return "Pace: slightly slower than normal.";
  if (speakingRate <= 1.05) return undefined;
  if (speakingRate < 1.2) return "Pace: slightly faster than normal.";
  return "Pace: fast and energetic.";
};

type InteractionResponse = {
  status?: string;
  output_audio?: { data?: string; mime_type?: string; sample_rate?: number; channels?: number };
  errors?: unknown;
  error?: { message?: string };
};

export const createGeminiBackend = (config: GeminiConfig = {}): TtsBackend => {
  const model = config.model ?? "gemini-3.8-flash-tts";
  const style = config.style ?? DEFAULT_GEMINI_STYLE;
  const baseUrl = (config.baseUrl ?? "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const apiVersion = config.apiVersion ?? "v1beta";
  const env = config.env ?? process.env;
  const doFetch = config.fetch ?? fetch;

  return {
    name: "gemini",
    defaultVoiceId: config.defaultVoiceId ?? "Kore",
    extension: "wav",
    cacheIdentity: { model, style, apiVersion },
    async generate(text, { voiceId, speakingRate }) {
      // Checked here, not at construction, so cached files work without a key.
      const apiKey = requireApiKey(env, GEMINI_API_KEY_ENV, "gemini");
      const fullStyle = [style, pacingHint(speakingRate)].filter(Boolean).join("\n");
      const body = {
        model,
        input: [
          {
            type: "text",
            text,
            annotations: [{ type: "speech_metadata", style: fullStyle }],
          },
        ],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: voiceId }] },
      };

      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/${apiVersion}/interactions`, {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new TtsError(`gemini: request failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      const raw = await res.text();
      let json: InteractionResponse;
      try {
        json = JSON.parse(raw) as InteractionResponse;
      } catch {
        throw new TtsError(`gemini: HTTP ${res.status}, response was not JSON: ${raw.slice(0, 500)}`);
      }
      if (!res.ok) {
        throw new TtsError(`gemini: HTTP ${res.status}: ${json.error?.message ?? raw.slice(0, 500)}`);
      }
      const audio = json.output_audio;
      if (!audio?.data) {
        const why = json.errors ? JSON.stringify(json.errors).slice(0, 500) : `status ${json.status ?? "unknown"}`;
        throw new TtsError(`gemini: response contained no audio (${why})`);
      }

      const bytes = new Uint8Array(Buffer.from(audio.data, "base64"));
      const isWav = bytes.byteLength >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF";
      if (isWav) return { data: bytes };
      if (audio.mime_type && !/^audio\/(l16|pcm)/i.test(audio.mime_type)) {
        throw new TtsError(`gemini: unexpected audio format ${audio.mime_type}, expected WAV or 16-bit PCM`);
      }
      return {
        data: wrapPcmAsWav(bytes, {
          sampleRate: audio.sample_rate ?? 24000,
          channels: audio.channels ?? 1,
          bitsPerSample: 16,
        }),
      };
    },
  };
};
