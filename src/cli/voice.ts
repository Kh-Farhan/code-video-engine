import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { wordCaptionSchema, wordTimingSources } from "../schema/manifest";
import { stripPauseMarkers } from "../schema/pauses";
import type { Script } from "../schema/script";
import {
  createTtsProvider,
  measureAudioDuration,
  toPublicPath,
  ttsProviderNames,
  type TtsProvider,
} from "../tts";
import { alignScenes, alignTrack, chooseAligner, type AlignDeps, type AlignMode } from "./align";
import { alignmentText, continuousSceneWords, voiceContinuous } from "./narration";
import { CliError, type Reporter } from "./progress";

/**
 * Written by `voice` next to the audio, read by `build-manifest`. Records
 * which file belongs to which scene so the manifest does not depend on how
 * the TTS cache names its files. Version 1 is per-scene audio
 * (--per-scene-audio); version 2 is one continuous narration track.
 */
export const perSceneVoiceIndexSchema = z
  .object({
    version: z.literal(1),
    slug: z.string(),
    provider: z.enum(ttsProviderNames),
    /** Voice the audio was generated with. Missing in indexes written before voices were configurable. */
    voice: z.string().optional(),
    speed: z.number().optional(),
    scenes: z.array(
      z
        .object({
          narration: z.string(),
          /** Path relative to public/, as staticFile() expects. */
          audio: z.string().min(1),
          durationSeconds: z.number().positive(),
          /**
           * Word timings aligned to this audio (Remotion Caption objects, text
           * from the narration). Missing when alignment was off or failed.
           */
          words: z.array(wordCaptionSchema).optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type PerSceneVoiceIndex = z.infer<typeof perSceneVoiceIndexSchema>;

export const continuousVoiceIndexSchema = z
  .object({
    version: z.literal(2),
    slug: z.string(),
    provider: z.enum(ttsProviderNames),
    voice: z.string(),
    speed: z.number(),
    narration: z
      .object({
        /** The whole narration, path relative to public/. */
        audio: z.string().min(1),
        durationSeconds: z.number().positive(),
        /** How many provider requests it took (more than 1 when split at sentences). */
        chunks: z.number().int().positive(),
      })
      .strict(),
    scenes: z.array(
      z
        .object({
          narration: z.string(),
          /** Every script word of the scene, in ms from the start of the track. */
          words: z.array(wordCaptionSchema),
          source: z.enum(wordTimingSources),
        })
        .strict(),
    ),
  })
  .strict();
export type ContinuousVoiceIndex = z.infer<typeof continuousVoiceIndexSchema>;

export const voiceIndexSchema = z.union([perSceneVoiceIndexSchema, continuousVoiceIndexSchema]);
export type VoiceIndex = z.infer<typeof voiceIndexSchema>;

export type SceneAudio = PerSceneVoiceIndex["scenes"][number];

/** The continuous narration as build-manifest needs it. */
export type ContinuousAudio = {
  audio: string;
  durationSeconds: number;
  scenes: ContinuousVoiceIndex["scenes"];
};

export type VoiceMode = "continuous" | "per-scene";

/**
 * The voice to use: the --voice flag, else the script's entry for this
 * provider, else undefined (the provider's default). Mock has no voices.
 */
export const resolveVoice = (
  script: Pick<Script, "voice">,
  providerName: string,
  override?: string,
): string | undefined => {
  if (providerName === "mock") return undefined;
  const voices: Record<string, unknown> = script.voice ?? {};
  const fromScript = voices[providerName];
  return override?.trim() || (typeof fromScript === "string" ? fromScript : undefined);
};

/**
 * The provider to voice with: --provider mock always wins (offline runs and
 * tests), else the script's style.ttsProvider, else --provider, else mock.
 * Whatever is picked voices the whole video: providers are never mixed.
 */
export const resolveProvider = (
  script: Partial<Pick<Script, "style">>,
  override?: string,
): { name: string; from: "flag" | "script" | "default" } => {
  const fromScript = script.style?.ttsProvider;
  if (override === "mock") return { name: "mock", from: "flag" };
  if (fromScript) return { name: fromScript, from: "script" };
  return override ? { name: override, from: "flag" } : { name: "mock", from: "default" };
};

/** Speaking speed: the --speed flag, else the script's voice.speed, else 1. */
export const resolveSpeed = (script: Pick<Script, "voice">, override?: number): number =>
  override ?? script.voice?.speed ?? 1;

/** Generates (or reuses) audio for every scene, in order. */
export const voiceScript = async (
  script: Script,
  provider: TtsProvider,
  report: Pick<Reporter, "info">,
  publicDir = "public",
  voiceId?: string,
  speakingRate = 1,
): Promise<SceneAudio[]> => {
  const scenes: SceneAudio[] = [];
  for (const [i, scene] of script.scenes.entries()) {
    // Pause markers are for the continuous track; here they are only removed, never spoken.
    const result = await provider.synthesize(stripPauseMarkers(scene.narration), { voiceId, speakingRate });
    const audio = toPublicPath(result.path, publicDir);
    report.info(
      `scene ${i + 1}/${script.scenes.length} (${scene.type}): ${result.durationSeconds.toFixed(2)}s ${result.cached ? "cached" : "generated"} -> ${publicDir}/${audio}`,
    );
    scenes.push({ narration: scene.narration, audio, durationSeconds: result.durationSeconds });
  }
  return scenes;
};

type VoicePaths = { publicDir: string; audioDir: string; voiceIndex: string };

const writeIndex = async (path: string, index: VoiceIndex) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`);
};

export type MakeProvider = (name: string, cacheDir: string, debug?: (message: string) => void) => TtsProvider;

const defaultMakeProvider: MakeProvider = (name, cacheDir, debug) =>
  createTtsProvider(name, { cacheDir, ...(debug ? { debug } : {}) });

/** --debug-tts output: indented under the current step, marked so it is easy to grep. */
export const debugLogger = (report: Pick<Reporter, "info">) => (message: string) => report.info(`[debug-tts] ${message}`);

const setUpProvider = (
  script: Script,
  providerName: string | undefined,
  paths: VoicePaths,
  report: Pick<Reporter, "info">,
  voiceOverride?: string,
  speedOverride?: number,
  makeProvider: MakeProvider = defaultMakeProvider,
  debug?: (message: string) => void,
) => {
  const picked = resolveProvider(script, providerName);
  const provider = makeProvider(picked.name, paths.audioDir, debug);
  const voiceId = resolveVoice(script, provider.name, voiceOverride);
  const voice = voiceId ?? provider.defaultVoiceId;
  const speed = resolveSpeed(script, speedOverride);
  const source =
    picked.from === "script"
      ? ` (style.ttsProvider${providerName && providerName !== picked.name ? `, overrides --provider ${providerName}` : ""})`
      : "";
  report.info(
    `provider: ${provider.name}${source}, voice: ${voice}${voiceId ? "" : " (default)"}${speed === 1 ? "" : `, speed ${speed}x`}`,
  );
  return { provider, voiceId, voice, speed };
};

export type RunVoiceOptions = { mode?: AlignMode } & AlignDeps & {
  /** The --per-scene-audio fallback: one file per scene, padded between scenes. */
  perSceneAudio?: boolean;
  /** Replaced in tests. */
  makeProvider?: MakeProvider;
  /** --debug-tts: log the exact text of every TTS request. */
  debugTts?: boolean;
  /** --question-chunks / --no-question-chunks: overrides style.questionChunks. */
  questionChunks?: boolean;
};

/**
 * Voices the script and writes the audio index: one continuous track by
 * default, or one file per scene with `perSceneAudio`.
 */
export const runVoice = (
  script: Script,
  slug: string,
  providerName: string | undefined,
  paths: VoicePaths,
  report: Pick<Reporter, "info">,
  voiceOverride?: string,
  speedOverride?: number,
  options: RunVoiceOptions = {},
): Promise<VoiceIndex> =>
  options.perSceneAudio
    ? runVoicePerScene(script, slug, providerName, paths, report, voiceOverride, speedOverride, options)
    : runVoiceContinuous(script, slug, providerName, paths, report, voiceOverride, speedOverride, options);

export const runVoiceContinuous = async (
  script: Script,
  slug: string,
  providerName: string | undefined,
  paths: VoicePaths,
  report: Pick<Reporter, "info">,
  voiceOverride?: string,
  speedOverride?: number,
  { mode, makeProvider, perSceneAudio: _perScene, debugTts, questionChunks, ...deps }: RunVoiceOptions = {},
): Promise<ContinuousVoiceIndex> => {
  const debug = debugTts ? debugLogger(report) : undefined;
  const { provider, voiceId, voice, speed } = setUpProvider(
    script, providerName, paths, report, voiceOverride, speedOverride, makeProvider, debug,
  );
  report.info("voicing the whole script as one continuous narration");
  const track = await voiceContinuous(script, provider, report, paths, voiceId, speed, undefined, {
    ...(questionChunks !== undefined ? { questionChunks } : {}),
    ...(debug ? { debug } : {}),
  });
  const narrations = script.scenes.map((s) => s.narration);
  const aligned = await alignTrack(
    track.audio,
    alignmentText(narrations),
    chooseAligner(mode, provider.name, deps),
    paths.publicDir,
    report,
  );
  const timed = continuousSceneWords(narrations, track, aligned);
  if (timed[0]?.source === "estimated") {
    report.info(
      track.segments.length > 1
        ? `word timing estimated inside ${track.segments.length} sentence spans from ${provider.name}`
        : "word timing estimated across the track",
    );
  }
  const index: ContinuousVoiceIndex = {
    version: 2,
    slug,
    provider: provider.name,
    voice,
    speed,
    narration: { audio: track.audio, durationSeconds: track.durationSeconds, chunks: track.chunks },
    scenes: script.scenes.map((scene, i) => ({ narration: scene.narration, ...timed[i]! })),
  };
  await writeIndex(paths.voiceIndex, index);
  report.info(`${script.scenes.length} scenes in one ${track.durationSeconds.toFixed(1)}s track, index at ${paths.voiceIndex}`);
  return index;
};

export const runVoicePerScene = async (
  script: Script,
  slug: string,
  providerName: string | undefined,
  paths: VoicePaths,
  report: Pick<Reporter, "info">,
  voiceOverride?: string,
  speedOverride?: number,
  { mode, makeProvider, perSceneAudio: _perScene, debugTts, questionChunks: _q, ...deps }: RunVoiceOptions = {},
): Promise<PerSceneVoiceIndex> => {
  const debug = debugTts ? debugLogger(report) : undefined;
  const { provider, voiceId, voice, speed } = setUpProvider(
    script, providerName, paths, report, voiceOverride, speedOverride, makeProvider, debug,
  );
  report.info("voicing each scene separately (--per-scene-audio)");
  const voiced = await voiceScript(script, provider, report, paths.publicDir, voiceId, speed);
  const scenes = await alignScenes(
    script,
    voiced,
    chooseAligner(mode, provider.name, deps),
    paths.publicDir,
    report,
  );
  const index: PerSceneVoiceIndex = { version: 1, slug, provider: provider.name, voice, speed, scenes };
  await writeIndex(paths.voiceIndex, index);
  const total = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  report.info(`${scenes.length} scenes, ${total.toFixed(1)}s of narration, index at ${paths.voiceIndex}`);
  return index;
};

const readIndex = async (voiceIndexPath: string): Promise<VoiceIndex> => {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(voiceIndexPath, "utf8"));
  } catch {
    throw new CliError(`No readable audio index at ${voiceIndexPath}. Run \`pnpm video voice\` first.`);
  }
  const parsed = voiceIndexSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError(`${voiceIndexPath} is not a valid audio index. Run \`pnpm video voice\` again.`);
  }
  return parsed.data;
};

const checkFresh = (script: Script, scenes: readonly { narration: string }[]) => {
  const changed = script.scenes.findIndex((s, i) => s.narration !== scenes[i]?.narration);
  const stale =
    script.scenes.length !== scenes.length
      ? `the script has ${script.scenes.length} scenes but the audio covers ${scenes.length}`
      : changed >= 0
        ? `the narration of scene ${changed + 1} changed`
        : undefined;
  if (stale) {
    throw new CliError(`Audio is out of date: ${stale}. Run \`pnpm video voice\` again.`);
  }
};

const measure = async (publicDir: string, audio: string): Promise<number> => {
  try {
    return await measureAudioDuration(join(publicDir, audio));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new CliError(`Audio for "${audio}" is missing or unreadable (${reason}). Run \`pnpm video voice\` again.`);
  }
};

export type LoadedAudio =
  | { mode: "per-scene"; scenes: SceneAudio[] }
  | { mode: "continuous"; narration: ContinuousAudio };

/**
 * Reads the voice index, whichever mode wrote it, and checks it still
 * matches the script, so a stale index (narration edited since `voice` ran)
 * fails loudly instead of producing captions that do not match the audio.
 * Durations are measured again so a replaced or truncated file cannot
 * desync the video.
 */
export const loadVoiceAudio = async (
  script: Script,
  paths: { voiceIndex: string; publicDir: string },
): Promise<LoadedAudio> => {
  const index = await readIndex(paths.voiceIndex);
  checkFresh(script, index.scenes);
  if (index.version === 1) {
    return {
      mode: "per-scene",
      scenes: await Promise.all(
        index.scenes.map(async (s) => ({ ...s, durationSeconds: await measure(paths.publicDir, s.audio) })),
      ),
    };
  }
  return {
    mode: "continuous",
    narration: {
      audio: index.narration.audio,
      durationSeconds: await measure(paths.publicDir, index.narration.audio),
      scenes: index.scenes,
    },
  };
};

/** Per-scene audio only (the --per-scene-audio index). */
export const loadSceneAudio = async (
  script: Script,
  paths: { voiceIndex: string; publicDir: string },
): Promise<SceneAudio[]> => {
  const loaded = await loadVoiceAudio(script, paths);
  if (loaded.mode !== "per-scene") {
    throw new CliError(`${paths.voiceIndex} holds one continuous narration, not per-scene audio.`);
  }
  return loaded.scenes;
};
