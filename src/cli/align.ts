import { join } from "node:path";
import {
  createAligner,
  createWhisperTranscriber,
  whisperConfigFromEnv,
  whisperStatus,
  type Aligner,
} from "../align";
import type { Script } from "../schema/script";
import type { Reporter } from "./progress";
import type { SceneAudio } from "./voice";

/**
 * Picks whether `voice` aligns captions to the audio and runs it. Alignment
 * is best effort: whenever it cannot run or fails, captions fall back to the
 * word-length estimate with a warning, and the video still renders.
 */

export const SETUP_HINT = "run `pnpm video whisper-setup` to install it";

/** `--align` (true), `--no-align` (false), or neither (on when whisper.cpp is installed). */
export type AlignMode = boolean | undefined;

export type AlignChoice =
  | { aligner: Aligner; description: string }
  | { aligner: undefined; reason: string; warn: boolean };

export type AlignDeps = {
  env?: Record<string, string | undefined>;
  /** Replaced in tests. */
  exists?: (path: string) => boolean;
  makeAligner?: () => Aligner;
};

export const chooseAligner = (
  mode: AlignMode,
  providerName: string,
  { env = process.env, exists, makeAligner }: AlignDeps = {},
): AlignChoice => {
  if (mode === false) {
    return { aligner: undefined, reason: "alignment off (--no-align), captions use estimated timing", warn: false };
  }
  if (providerName === "mock") {
    return {
      aligner: undefined,
      reason: "mock audio is silent, so there is nothing to align; captions use estimated timing",
      warn: mode === true,
    };
  }
  if (makeAligner) return { aligner: makeAligner(), description: "injected aligner" };
  let config;
  try {
    config = whisperConfigFromEnv(env);
  } catch (err) {
    return { aligner: undefined, reason: `${err instanceof Error ? err.message : String(err)}; captions use estimated timing`, warn: true };
  }
  const status = whisperStatus(config, exists);
  if (!status.available) {
    return {
      aligner: undefined,
      reason: `${status.reason}; captions use estimated timing (${SETUP_HINT})`,
      warn: true,
    };
  }
  const transcriberId = `whisper.cpp ${config.version} ${config.model}`;
  return {
    aligner: createAligner({ transcriber: createWhisperTranscriber(config), transcriberId }),
    description: transcriberId,
  };
};

const warning = (message: string) => `WARNING: ${message}`;

/**
 * Adds aligned word timings to each scene. A scene whose alignment fails
 * keeps no words, so the manifest estimates its timing, and a warning says why.
 */
export const alignScenes = async (
  script: Script,
  scenes: readonly SceneAudio[],
  choice: AlignChoice,
  publicDir: string,
  report: Pick<Reporter, "info">,
): Promise<SceneAudio[]> => {
  if (!choice.aligner) {
    report.info(choice.warn ? warning(choice.reason) : choice.reason);
    return scenes.map(({ words: _words, ...rest }) => rest);
  }
  report.info(`aligning captions with ${choice.description}`);
  const out: SceneAudio[] = [];
  let failed = 0;
  for (const [i, s] of scenes.entries()) {
    const label = `scene ${i + 1}/${scenes.length} (${script.scenes[i]?.type ?? "?"})`;
    try {
      const result = await choice.aligner.align(join(publicDir, s.audio), s.narration);
      report.info(
        `${label}: ${result.captions.length} words aligned, ${Math.round(result.matchRatio * 100)}% letters matched${result.cached ? " (cached)" : ""}`,
      );
      out.push({ ...s, words: result.captions });
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);
      report.info(warning(`${label}: alignment failed (${reason}); using estimated timing`));
      const { words: _words, ...rest } = s;
      out.push(rest);
    }
  }
  if (failed > 0) {
    report.info(warning(`${failed} of ${scenes.length} scenes use estimated caption timing`));
  }
  return out;
};
