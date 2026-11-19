import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createTtsProvider, type TtsProvider } from "../tts";
import { voiceContinuous } from "./narration";
import { CliError, type Reporter } from "./progress";

/**
 * `voice-test`: says each sentence in each voice and writes one WAV per
 * pair to out/voice-test/, so voices (and question chunking) can be compared
 * by ear. Every sentence goes through the same text and pause pipeline as a
 * real video (a one-scene script voiced as continuous narration), so what
 * you hear is what a Short would get.
 */

export const VOICE_TEST_DIR = join("out", "voice-test");

/**
 * "So, does it log one, or three?" -> "so-does-it-log-one-or-three-q". A
 * question gets "-q", so "What does this log?" and "What does this log."
 * never overwrite each other.
 */
export const sentenceSlug = (sentence: string, maxLength = 40): string => {
  const base =
    sentence
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLength)
      .replace(/-+$/, "") || "sentence";
  return /\?["')\]]*\s*$/.test(sentence) ? `${base}-q` : base;
};

/** Splits a --voices value: "am_puck, am_michael" -> ["am_puck", "am_michael"]. */
export const parseVoices = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export type VoiceTestOptions = {
  sentences: readonly string[];
  /** Empty: the provider's default voice. */
  voices: readonly string[];
  provider: string;
  speed?: number;
  /** undefined: on, as in a real video. false writes files with a "-no-qc" suffix. */
  questionChunks?: boolean;
  outDir?: string;
  debug?: (message: string) => void;
  /** Replaced in tests. */
  makeProvider?: (name: string, cacheDir: string, debug?: (message: string) => void) => TtsProvider;
};

export type VoiceTestFile = { sentence: string; voice: string; path: string; durationSeconds: number };

export const voiceTestFileName = (
  index: number,
  sentence: string,
  voice: string,
  speed: number,
  questionChunks: boolean,
): string => `${index + 1}-${sentenceSlug(sentence)}-${voice}-${speed}x${questionChunks ? "" : "-no-qc"}.wav`;

export const runVoiceTest = async (
  report: Pick<Reporter, "info">,
  {
    sentences,
    voices,
    provider: providerName,
    speed = 1,
    questionChunks,
    outDir = VOICE_TEST_DIR,
    debug,
    makeProvider = (name, cacheDir, log) => createTtsProvider(name, { cacheDir, ...(log ? { debug: log } : {}) }),
  }: VoiceTestOptions,
): Promise<VoiceTestFile[]> => {
  const clean = sentences.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) throw new CliError('voice-test: pass at least one sentence, e.g. pnpm video voice-test "What does this log?"');
  const cacheDir = join(outDir, ".cache");
  const provider = makeProvider(providerName, join(cacheDir, "tts"), debug);
  const voiceList = voices.length > 0 ? voices : [provider.defaultVoiceId];
  const qc = questionChunks ?? true;
  report.info(
    `provider: ${provider.name}, ${voiceList.length} ${voiceList.length === 1 ? "voice" : "voices"} (${voiceList.join(", ")}), speed ${speed}x, questionChunks ${qc ? "on" : "off"}`,
  );
  await mkdir(outDir, { recursive: true });
  const files: VoiceTestFile[] = [];
  for (const [i, sentence] of clean.entries()) {
    for (const voice of voiceList) {
      report.info(`"${sentence}" in ${voice}`);
      const track = await voiceContinuous(
        { scenes: [{ narration: sentence }] },
        provider,
        { info: () => {} },
        { publicDir: outDir, audioDir: cacheDir },
        voice,
        speed,
        undefined,
        { questionChunks: qc, ...(debug ? { debug } : {}) },
      );
      const path = join(outDir, voiceTestFileName(i, sentence, voice, speed, qc));
      await copyFile(join(outDir, track.audio), path);
      report.info(`  ${track.durationSeconds.toFixed(2)}s -> ${path}`);
      files.push({ sentence, voice, path, durationSeconds: track.durationSeconds });
    }
  }
  return files;
};
