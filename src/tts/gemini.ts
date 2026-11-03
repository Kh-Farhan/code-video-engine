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
 * Response: the audio is a `{ type: "audio", data, mime_type, sample_rate }`
 * item in `steps[].content[]` of a `model_output` step, base64 encoded.
 * (`output_audio` is a shortcut the SDK adds on the client; the REST response
 * does not carry it, so it is only a fallback here, as is the older
 * `outputs` array.) The data is a full WAV or raw 16-bit PCM, usually 24 kHz
 * mono; raw PCM is wrapped in a WAV header.
 * Text is spoken verbatim, so delivery instructions (including pace) go in
 * the `speech_metadata` style, never in the text. There is no numeric rate
 * parameter, so `speakingRate` becomes a pacing hint.
 * Response shape checked against @google/genai 2.32.0, which derives its
 * `output_audio` from `steps` the same way `findAudio` does.
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

type AudioItem = {
  type?: string;
  data?: string;
  mime_type?: string;
  sample_rate?: number;
  channels?: number;
};

type InteractionResponse = {
  status?: string;
  steps?: { type?: string; content?: AudioItem[] }[];
  /** Older response format: one flat list of outputs. */
  outputs?: AudioItem[];
  /** Added by the SDK, not by the API. Accepted in case a proxy adds it too. */
  output_audio?: AudioItem;
  errors?: unknown;
  error?: { message?: string };
};

/** The last audio item the model produced, wherever the response put it. */
export const findAudio = (json: InteractionResponse): AudioItem | undefined => {
  const isAudio = (item: AudioItem | undefined): item is AudioItem =>
    Boolean(item?.data) && (item?.type === undefined || item.type === "audio");
  const fromSteps = (json.steps ?? [])
    .filter((step) => step.type === "model_output" || step.type === undefined)
    .flatMap((step) => step.content ?? [])
    .filter(isAudio)
    .at(-1);
  return fromSteps ?? (json.outputs ?? []).filter(isAudio).at(-1) ?? (isAudio(json.output_audio) ? json.output_audio : undefined);
};

/** What came back instead of audio, for the error message. No base64 payloads. */
const describeResponse = (json: InteractionResponse): string => {
  const parts = [`status ${json.status ?? "unknown"}`];
  const items = [...(json.steps ?? []).flatMap((s) => s.content ?? []), ...(json.outputs ?? [])];
  if (json.steps) parts.push(`steps: ${json.steps.map((s) => s.type ?? "?").join(", ") || "none"}`);
  if (items.length > 0) parts.push(`content types: ${items.map((i) => i.type ?? "?").join(", ")}`);
  if (json.errors) parts.push(`errors: ${JSON.stringify(json.errors).slice(0, 300)}`);
  return parts.join("; ");
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
      const audio = findAudio(json);
      if (!audio?.data) {
        throw new TtsError(`gemini: response contained no audio (${describeResponse(json)})`);
      }

      const bytes = new Uint8Array(Buffer.from(audio.data, "base64"));
      const isWav = bytes.byteLength >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF";
      if (isWav) return { data: bytes };
      if (audio.mime_type && !/^audio\/(l16|pcm)/i.test(audio.mime_type)) {
        throw new TtsError(`gemini: unexpected audio format ${audio.mime_type}, expected WAV or 16-bit PCM`);
      }
      // e.g. "audio/L16;codec=pcm;rate=24000"
      const mimeRate = Number(/rate=(\d+)/i.exec(audio.mime_type ?? "")?.[1]);
      return {
        data: wrapPcmAsWav(bytes, {
          sampleRate: audio.sample_rate ?? (mimeRate || 24000),
          channels: audio.channels ?? 1,
          bitsPerSample: 16,
        }),
      };
    },
  };
};
