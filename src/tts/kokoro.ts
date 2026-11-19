import { spokenSentences } from "./pauses";
import { encodeWav, floatToPcm16 } from "./pcm";
import { joinChunks, narrationAudio } from "./stitch";
import { TtsError, type SpokenSegment, type TtsBackend } from "./types";

export { floatToPcm16 };

/**
 * Kokoro: a free, open (Apache 2.0) TTS model that runs locally through
 * kokoro-js, so there is no API key and no rate limit. The first run
 * downloads the model from Hugging Face (about 90 MB at q8) into the
 * transformers.js cache; later runs work offline.
 *
 * Narration is split into sentences here (spokenSentences) and each one is
 * generated on its own with `stream`, because `generate` silently truncates
 * text past the model's token limit. kokoro-js's own splitter is not trusted
 * with the whole text: it tracks open quotes, so one unmatched apostrophe
 * ("the users' data") stops all splitting after it and the rest of the
 * text, questions included, goes to the model as one run (no "?" at the end
 * of an input, and long text gets cut at the token limit).
 * The sentences are joined with a short silence and fade (see stitch.ts),
 * and each sentence's span is reported as a segment, so the whole script can
 * be voiced in one call and scene boundaries still land exactly.
 * kokoro-js 1.2 does not expose word timestamps, so word timing comes from
 * whisper alignment (or is estimated inside each sentence).
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
  ): AsyncIterable<{ text?: string; phonemes?: string; audio: { audio: Float32Array; sampling_rate: number } }>;
};

export type KokoroConfig = {
  /** Default "q8": about 90 MB and close to full quality. "fp32" is about 330 MB. */
  dtype?: KokoroDtype;
  defaultVoiceId?: string;
  /** Loads the model. Replaced in tests; the default imports kokoro-js. */
  load?: (dtype: KokoroDtype) => Promise<KokoroModel>;
  log?: (message: string) => void;
  /** --debug-tts: called with every sentence sent to the model and its phonemes. */
  debug?: (message: string) => void;
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
    // `join` changes whenever sentences are stitched differently, so old files are not reused.
    cacheIdentity: {
      model: KOKORO_MODEL_ID,
      dtype,
      join: `gap${narrationAudio.chunkGapMs}-fade${narrationAudio.chunkFadeMs}`,
      // Sentences are split by spokenSentences, not kokoro-js (changes audio for quoted text).
      split: "spoken-sentences-1",
    },
    questionChunks: true,
    async generate(text, { voiceId, speakingRate }) {
      if (!(kokoroVoices as readonly string[]).includes(voiceId)) {
        throw new TtsError(
          `kokoro: unknown voice "${voiceId}". Use one of: ${kokoroVoices.join(", ")}.`,
        );
      }
      const tts = await getModel();
      const sentences: { text: string; samples: Float32Array }[] = [];
      let sampleRate = 24000;
      try {
        for (const sentence of spokenSentences(text)) {
          for await (const chunk of tts.stream(sentence, { voice: voiceId, speed: speakingRate })) {
            config.debug?.(
              `kokoro sentence ${sentences.length + 1}: ${JSON.stringify(chunk.text ?? sentence)}${chunk.phonemes === undefined ? "" : ` phonemes ${JSON.stringify(chunk.phonemes)}`}`,
            );
            sentences.push({ text: chunk.text ?? "", samples: chunk.audio.audio });
            sampleRate = chunk.audio.sampling_rate;
          }
        }
      } catch (err) {
        throw new TtsError(`kokoro: generation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (sentences.length === 0) throw new TtsError("kokoro: generated no audio");
      const { pcm, offsetsMs } = joinChunks(sentences.map((s) => ({ sampleRate, samples: s.samples })));
      // Only report segments when every sentence came back with its text.
      const segments: SpokenSegment[] | undefined = sentences.every((s) => s.text.trim())
        ? sentences.map((s, i) => ({
            text: s.text.trim(),
            startSeconds: offsetsMs[i]! / 1000,
            endSeconds: offsetsMs[i]! / 1000 + s.samples.length / sampleRate,
          }))
        : undefined;
      return { data: encodeWav(pcm), ...(segments ? { segments } : {}) };
    },
  };
};
