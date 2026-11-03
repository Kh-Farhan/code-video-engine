import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { Script } from "../schema/script";
import {
  createTtsProvider,
  measureAudioDuration,
  toPublicPath,
  ttsProviderNames,
  type TtsProvider,
} from "../tts";
import { CliError, type Reporter } from "./progress";

/**
 * Written by `voice` next to the audio, read by `build-manifest`. Records
 * which file belongs to which scene so the manifest does not depend on how
 * the TTS cache names its files.
 */
export const voiceIndexSchema = z
  .object({
    version: z.literal(1),
    slug: z.string(),
    provider: z.enum(ttsProviderNames),
    /** Voice the audio was generated with. Missing in indexes written before voices were configurable. */
    voice: z.string().optional(),
    scenes: z.array(
      z
        .object({
          narration: z.string(),
          /** Path relative to public/, as staticFile() expects. */
          audio: z.string().min(1),
          durationSeconds: z.number().positive(),
        })
        .strict(),
    ),
  })
  .strict();
export type VoiceIndex = z.infer<typeof voiceIndexSchema>;

export type SceneAudio = VoiceIndex["scenes"][number];

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
  const fromScript = script.voice?.[providerName as keyof NonNullable<Script["voice"]>];
  return override?.trim() || fromScript;
};

/** Generates (or reuses) audio for every scene, in order. */
export const voiceScript = async (
  script: Script,
  provider: TtsProvider,
  report: Pick<Reporter, "info">,
  publicDir = "public",
  voiceId?: string,
): Promise<SceneAudio[]> => {
  const scenes: SceneAudio[] = [];
  for (const [i, scene] of script.scenes.entries()) {
    const result = await provider.synthesize(scene.narration, { voiceId });
    const audio = toPublicPath(result.path, publicDir);
    report.info(
      `scene ${i + 1}/${script.scenes.length} (${scene.type}): ${result.durationSeconds.toFixed(2)}s ${result.cached ? "cached" : "generated"} -> ${publicDir}/${audio}`,
    );
    scenes.push({ narration: scene.narration, audio, durationSeconds: result.durationSeconds });
  }
  return scenes;
};

export const runVoice = async (
  script: Script,
  slug: string,
  providerName: string,
  paths: { publicDir: string; audioDir: string; voiceIndex: string },
  report: Pick<Reporter, "info">,
  voiceOverride?: string,
): Promise<VoiceIndex> => {
  const provider = createTtsProvider(providerName, { cacheDir: paths.audioDir });
  const voiceId = resolveVoice(script, provider.name, voiceOverride);
  const voice = voiceId ?? provider.defaultVoiceId;
  report.info(`provider: ${provider.name}, voice: ${voice}${voiceId ? "" : " (default)"}`);
  const scenes = await voiceScript(script, provider, report, paths.publicDir, voiceId);
  const index: VoiceIndex = { version: 1, slug, provider: provider.name, voice, scenes };
  await mkdir(dirname(paths.voiceIndex), { recursive: true });
  await writeFile(paths.voiceIndex, `${JSON.stringify(index, null, 2)}\n`);
  const total = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  report.info(`${scenes.length} scenes, ${total.toFixed(1)}s of narration, index at ${paths.voiceIndex}`);
  return index;
};

/**
 * Reads the voice index and checks it still matches the script, so a stale
 * index (narration edited since `voice` ran) fails loudly instead of
 * producing captions that do not match the audio.
 */
export const loadSceneAudio = async (
  script: Script,
  { voiceIndex: voiceIndexPath, publicDir }: { voiceIndex: string; publicDir: string },
): Promise<SceneAudio[]> => {
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
  const { scenes } = parsed.data;
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
  // Measure again so a replaced or truncated file cannot desync the video.
  return Promise.all(
    scenes.map(async (s) => {
      try {
        return { ...s, durationSeconds: await measureAudioDuration(join(publicDir, s.audio)) };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new CliError(`Audio for "${s.audio}" is missing or unreadable (${reason}). Run \`pnpm video voice\` again.`);
      }
    }),
  );
};
