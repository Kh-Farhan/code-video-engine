import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { alignToScript, type AlignmentResult, type HeardWord } from "./match";
import { whisperJsonToWords } from "./tokens";
import { transcribeAudioFile, type Transcriber } from "./whisper";

/**
 * Times a scene's narration from its audio: transcribe once (cached by the
 * audio file's hash), then align the heard words to the script's words.
 */

/** Outside public/ so Remotion never bundles it. Gitignored. */
export const DEFAULT_ALIGN_CACHE_DIR = ".cache/align";

/** Bump when the cached data or how it is produced changes. */
const ALIGN_CACHE_VERSION = 1;

const heardWordSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  timestampMs: z.number().nullable().optional(),
  confidence: z.number().nullable().optional(),
});

const cacheEntrySchema = z.object({
  version: z.literal(ALIGN_CACHE_VERSION),
  /** Identifies what transcribed the audio, e.g. "whisper.cpp 1.7.6 base.en". */
  transcriber: z.string(),
  words: z.array(heardWordSchema),
});

export type SceneAlignment = AlignmentResult & { cached: boolean };

export type Aligner = {
  align(audioPath: string, narration: string): Promise<SceneAlignment>;
};

export type AlignerOptions = {
  transcriber: Transcriber;
  /** Part of the cache key, so switching model or version transcribes again. */
  transcriberId: string;
  cacheDir?: string;
  /** Replaced in tests; the default converts with Remotion's ffmpeg. */
  convert?: (input: string, output: string) => Promise<void>;
};

export const audioCacheKey = (audio: Uint8Array, transcriberId: string): string =>
  createHash("sha256")
    .update(`v${ALIGN_CACHE_VERSION}\0${transcriberId}\0`)
    .update(audio)
    .digest("hex")
    .slice(0, 32);

export const createAligner = ({
  transcriber,
  transcriberId,
  cacheDir = DEFAULT_ALIGN_CACHE_DIR,
  convert,
}: AlignerOptions): Aligner => {
  const heardWords = async (audioPath: string): Promise<{ words: HeardWord[]; cached: boolean }> => {
    const key = audioCacheKey(new Uint8Array(await readFile(audioPath)), transcriberId);
    const path = join(cacheDir, `${key}.json`);
    try {
      const entry = cacheEntrySchema.parse(JSON.parse(await readFile(path, "utf8")));
      return { words: entry.words, cached: true };
    } catch {
      // Missing or unreadable: transcribe again.
    }
    const json = await transcribeAudioFile(audioPath, transcriber, convert);
    const words = whisperJsonToWords(json);
    await mkdir(cacheDir, { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, `${JSON.stringify({ version: ALIGN_CACHE_VERSION, transcriber: transcriberId, words })}\n`);
      await rename(tmp, path);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
    return { words, cached: false };
  };

  return {
    async align(audioPath, narration) {
      const { words, cached } = await heardWords(audioPath);
      return { ...alignToScript(narration, words), cached };
    },
  };
};
