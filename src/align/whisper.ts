import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  transcribe,
  type TranscriptionJson,
  type WhisperModel,
} from "@remotion/install-whisper-cpp";

/**
 * whisper.cpp through @remotion/install-whisper-cpp. Only used on the CLI
 * side (Node), never in the Remotion bundle.
 */

/** Folder whisper.cpp is installed to, relative to the repo root. */
export const WHISPER_PATH_ENV = "WHISPER_CPP_PATH";
export const WHISPER_VERSION_ENV = "WHISPER_CPP_VERSION";
export const WHISPER_MODEL_ENV = "WHISPER_MODEL";

export const DEFAULT_WHISPER_PATH = "whisper.cpp";
/** Builds to build/bin/whisper-cli, the layout Remotion expects for 1.7.4 and later. */
export const DEFAULT_WHISPER_VERSION = "1.7.6";
/**
 * English-only base model: about 140 MB, fast on a laptop CPU, and plenty
 * for clean TTS audio where only the timing is used.
 */
export const DEFAULT_WHISPER_MODEL: WhisperModel = "base.en";

export type WhisperConfig = {
  whisperPath: string;
  version: string;
  model: WhisperModel;
};

const whisperModels = [
  "tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en",
  "large-v1", "large-v2", "large-v3", "large-v3-turbo",
] as const satisfies readonly WhisperModel[];

const isWhisperModel = (value: string): value is WhisperModel =>
  (whisperModels as readonly string[]).includes(value);

export const whisperConfigFromEnv = (env: Record<string, string | undefined> = process.env): WhisperConfig => {
  const model = env[WHISPER_MODEL_ENV]?.trim() || DEFAULT_WHISPER_MODEL;
  if (!isWhisperModel(model)) {
    throw new Error(`${WHISPER_MODEL_ENV}="${model}" is not a whisper model. Use one of: ${whisperModels.join(", ")}.`);
  }
  return {
    whisperPath: resolve(env[WHISPER_PATH_ENV]?.trim() || DEFAULT_WHISPER_PATH),
    version: env[WHISPER_VERSION_ENV]?.trim() || DEFAULT_WHISPER_VERSION,
    model,
  };
};

const isAtLeast = (version: string, min: string): boolean => {
  const a = version.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
};

/**
 * Where @remotion/install-whisper-cpp expects the binary (it does not export
 * this): build/bin/whisper-cli from 1.7.4, ./main before.
 */
export const whisperExecutablePath = (whisperPath: string, version: string): string => {
  const bin = isAtLeast(version, "1.7.4") ? join("build", "bin", "whisper-cli") : "main";
  return join(resolve(whisperPath), process.platform === "win32" ? `${bin}.exe` : bin);
};

/** Where downloadWhisperModel() puts a model, which is where transcribe() looks. */
export const whisperModelPath = (whisperPath: string, model: WhisperModel): string =>
  join(resolve(whisperPath), `ggml-${model}.bin`);

export type WhisperStatus = { available: true } | { available: false; reason: string };

/** Whether the whisper.cpp binary and the model file are both on disk. */
export const whisperStatus = (
  config: WhisperConfig,
  exists: (path: string) => boolean = existsSync,
): WhisperStatus => {
  const executable = whisperExecutablePath(config.whisperPath, config.version);
  if (!exists(executable)) {
    return { available: false, reason: `whisper.cpp not found at ${executable}` };
  }
  const model = whisperModelPath(config.whisperPath, config.model);
  if (!exists(model)) {
    return { available: false, reason: `whisper model ${config.model} not found at ${model}` };
  }
  return { available: true };
};

/** Takes a 16 kHz mono WAV path and returns whisper.cpp JSON with token timestamps. */
export type Transcriber = (wavPath: string) => Promise<TranscriptionJson<true>>;

export const createWhisperTranscriber = (config: WhisperConfig): Transcriber => (wavPath) =>
  transcribe({
    inputPath: wavPath,
    whisperPath: config.whisperPath,
    whisperCppVersion: config.version,
    model: config.model,
    tokenLevelTimestamps: true,
    language: config.model.endsWith(".en") ? null : "en",
    printOutput: false,
  });

const remotionCli = (): string => {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("@remotion/cli/package.json")), "remotion-cli.js");
};

/** Converts any audio file to 16 kHz mono 16-bit WAV with Remotion's bundled ffmpeg. */
export const convertTo16kWav = (input: string, output: string): Promise<void> =>
  new Promise((done, fail) => {
    const args = [
      remotionCli(), "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
      "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", output,
    ];
    const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", fail);
    child.on("exit", (code) => {
      if (code === 0 && existsSync(output)) done();
      else fail(new Error(`ffmpeg could not convert ${input} to 16 kHz WAV: ${stderr.trim() || `exit code ${code}`}`));
    });
  });

/** Transcribes any audio file: converts it to what whisper.cpp wants first. */
export const transcribeAudioFile = async (
  audioPath: string,
  transcriber: Transcriber,
  convert: (input: string, output: string) => Promise<void> = convertTo16kWav,
): Promise<TranscriptionJson<true>> => {
  const dir = await mkdtemp(join(tmpdir(), "cve-align-"));
  try {
    const wav = join(dir, "audio-16k.wav");
    await convert(audioPath, wav);
    return await transcriber(wav);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
