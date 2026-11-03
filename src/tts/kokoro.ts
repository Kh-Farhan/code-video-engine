import { TtsError, type TtsBackend } from "./types";
import { wrapPcmAsWav } from "./wav";

/**
 * Kokoro: a free, open (Apache 2.0) TTS model that runs locally through
 * kokoro-js, so there is no API key and no rate limit. The first run
 * downloads the model from Hugging Face (about 90 MB at q8) into the
 * transformers.js cache; later runs work offline.
 *
 * Narration is generated with `stream`, which splits it into sentences,
 * because `generate` silently truncates text past the model's token limit.
 * Output is 24 kHz mono float samples, written as 16-bit PCM WAV.
 */

export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** The best rated voice in the model card. */
export const KOKORO_DEFAULT_VOICE = "af_heart";

/** Voices shipped with kokoro-js 1.2. a = American, b = British; f = female, m = male. */
export const kokoroVoices = [
  "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole",
  "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx",
  "am_puck", "am_santa",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
] as const;

export type KokoroDtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";

/** The slice of kokoro-js this adapter uses. */
export type KokoroModel = {
  stream(
    text: string,
    options: { voice: string; speed: number },
  ): AsyncIterable<{ audio: { audio: Float32Array; sampling_rate: number } }>;
};

export type KokoroConfig = {
  /** Default "q8": about 90 MB and close to full quality. "fp32" is about 330 MB. */
  dtype?: KokoroDtype;
  defaultVoiceId?: string;
  /** Loads the model. Replaced in tests; the default imports kokoro-js. */
  load?: (dtype: KokoroDtype) => Promise<KokoroModel>;
  log?: (message: string) => void;
};

const loadKokoro = async (dtype: KokoroDtype): Promise<KokoroModel> => {
  const { KokoroTTS, TextSplitterStream } = await import("kokoro-js");
  const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype, device: "cpu" });
  return {
    stream(text, { voice, speed }) {
      // kokoro-js 1.2.1 never closes the splitter it makes for a plain
      // string, so stream() hangs after the first sentence. Pass a closed one.
      const splitter = new TextSplitterStream();
      splitter.push(text);
      splitter.close();
      return tts.stream(splitter, { voice: voice as (typeof kokoroVoices)[number], speed });
    },
  };
};

/** Float samples in [-1, 1] to 16-bit little-endian PCM. */
export const floatToPcm16 = (samples: Float32Array): Uint8Array => {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  samples.forEach((s, i) => {
    const clamped = Math.max(-1, Math.min(1, s));
    view.setInt16(i * 2, Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff), true);
  });
  return out;
};

export const createKokoroBackend = (config: KokoroConfig = {}): TtsBackend => {
  const dtype = config.dtype ?? "q8";
  const load = config.load ?? loadKokoro;
  const log = config.log ?? ((message: string) => console.log(`  ${message}`));
  let model: Promise<KokoroModel> | undefined;

  // Loaded on the first cache miss, so cached videos never touch the model.
  const getModel = () => {
    if (!model) {
      log(`loading Kokoro (${dtype}); the first run downloads the model, about 90 MB`);
      model = load(dtype).catch((err: unknown) => {
        model = undefined;
        const reason = err instanceof Error ? err.message : String(err);
        throw new TtsError(
          `kokoro: could not load the model (${reason}). The first run needs internet access to huggingface.co and *.hf.co.`,
        );
      });
    }
    return model;
  };

  return {
    name: "kokoro",
    defaultVoiceId: config.defaultVoiceId ?? KOKORO_DEFAULT_VOICE,
    extension: "wav",
    cacheIdentity: { model: KOKORO_MODEL_ID, dtype },
    async generate(text, { voiceId, speakingRate }) {
      if (!(kokoroVoices as readonly string[]).includes(voiceId)) {
        throw new TtsError(
          `kokoro: unknown voice "${voiceId}". Use one of: ${kokoroVoices.join(", ")}.`,
        );
      }
      const tts = await getModel();
      const chunks: Float32Array[] = [];
      let sampleRate = 24000;
      try {
        for await (const { audio } of tts.stream(text, { voice: voiceId, speed: speakingRate })) {
          chunks.push(audio.audio);
          sampleRate = audio.sampling_rate;
        }
      } catch (err) {
        throw new TtsError(`kokoro: generation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (chunks.length === 0) throw new TtsError("kokoro: generated no audio");
      const samples = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const c of chunks) {
        samples.set(c, offset);
        offset += c.length;
      }
      return {
        data: wrapPcmAsWav(floatToPcm16(samples), { sampleRate, channels: 1, bitsPerSample: 16 }),
      };
    },
  };
};
