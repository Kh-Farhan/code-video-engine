import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildUploadMetadata, renderUploadMarkdown } from "../metadata";
import type { Manifest } from "../schema/manifest";
import { MAX_SPEED, MIN_SPEED, type Script } from "../schema/script";
import type { ExplainerVideoProps } from "../scenes/explainerMetadata";
import { presetNames, type PresetName } from "../theme";
import { thumbnailCompositionIds } from "../thumbnail/compositions";
import type { ThumbnailProps } from "../thumbnail/Thumbnail";
import { isTtsProviderName, ttsProviderNames } from "../tts";
import { loadDotEnv } from "./env";
import { loadScriptFile, slugFromPath } from "./loadScript";
import { buildManifest, manifestToSrt, thumbnailFrame, writeJson } from "./manifest";
import { pipelinePaths } from "./paths";
import { CliError, createReporter, type Reporter } from "./progress";
import { BROWSER_EXECUTABLE_ENV, runRemotion } from "./remotion";
import { loadSceneAudio, runVoice } from "./voice";

const SCRIPTS_DIR = "scripts";

const usage = `Usage:
  pnpm video validate scripts/<slug>.yaml
  pnpm video voice scripts/<slug>.yaml [--provider mock|kokoro|elevenlabs|gemini] [--voice <name>] [--speed <n>]
  pnpm video build-manifest scripts/<slug>.yaml
  pnpm video thumbnail scripts/<slug>.yaml
  pnpm video render scripts/<slug>.yaml [--preset short|long] [--provider mock|kokoro|elevenlabs|gemini] [--voice <name>] [--speed <n>]
  pnpm video metadata scripts/<slug>.yaml
  pnpm video metadata --all

Options:
  --provider            TTS provider (default: mock)
  --voice               Voice for this run, e.g. am_puck for kokoro. Overrides the script's voice setting.
  --speed               Speaking speed for this run, ${MIN_SPEED} to ${MAX_SPEED} (1 is normal). Overrides voice.speed.
  --preset              Output format: short is 1080x1920, long is 1920x1080 (default: short)
  --browser-executable  Chrome or Chromium binary for rendering. Also read from ${BROWSER_EXECUTABLE_ENV}.
  --all                 metadata only: run for every .yaml script in ${SCRIPTS_DIR}/

API keys (GEMINI_API_KEY, ELEVENLABS_API_KEY) are read from the shell or from a .env file in the repo root.

Output:
  public/audio/<slug>/          generated narration and voice.json
  out/<slug>/manifest.json      render manifest
  out/<slug>/<slug>-<preset>.mp4, <slug>-<preset>-thumbnail.png, <slug>.srt
  out/<slug>/thumbnail.png      1280x720 thumbnail (headline, topic tag, code snippet)
  out/<slug>/cover.png          1080x1920 Shorts cover frame
  out/<slug>/upload.md          YouTube titles, description, hashtags and transcript`;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Options = {
  provider: string;
  voice?: string;
  speed?: number;
  preset: PresetName;
  browserExecutable?: string;
  all?: boolean;
};

const validateStep = (report: Reporter, path: string): Promise<{ script: Script; slug: string }> =>
  report.step(`Validate ${path}`, () => {
    const slug = slugFromPath(path);
    const errors: string[] = [];
    if (!SLUG_PATTERN.test(slug)) {
      errors.push(`(file name): "${slug}" must be kebab-case, e.g. scripts/use-memo-tips.yaml`);
    }
    let result: ReturnType<typeof loadScriptFile>;
    try {
      result = loadScriptFile(path);
    } catch (err) {
      throw new CliError(`Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!result.success) errors.push(...result.errors);
    const music = result.success ? result.data.music : undefined;
    const musicPath = music ? join(pipelinePaths(slug).publicDir, music.file) : undefined;
    if (musicPath && !existsSync(musicPath)) {
      errors.push(`music.file: ${musicPath} does not exist (paths are relative to public/)`);
    }
    if (errors.length > 0 || !result.success) {
      throw new CliError(
        `${path} is invalid (${errors.length} ${errors.length === 1 ? "problem" : "problems"}):\n${errors.map((e) => `  - ${e}`).join("\n")}`,
      );
    }
    const counts = result.data.scenes.reduce<Record<string, number>>((acc, s) => {
      acc[s.type] = (acc[s.type] ?? 0) + 1;
      return acc;
    }, {});
    report.info(`"${result.data.title}" (${slug})`);
    report.info(
      `${result.data.scenes.length} scenes: ${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(", ")}`,
    );
    if (musicPath) report.info(`music: ${musicPath}, ducked under narration`);
    return { script: result.data, slug };
  });

const voiceStep = (report: Reporter, script: Script, slug: string, o: Options) =>
  report.step(`Generate narration (${o.provider})`, () =>
    runVoice(script, slug, o.provider, pipelinePaths(slug), report, o.voice, o.speed),
  );

const manifestStep = (report: Reporter, script: Script, slug: string): Promise<Manifest> =>
  report.step("Build manifest", async () => {
    const paths = pipelinePaths(slug);
    const audio = await loadSceneAudio(script, paths);
    const manifest = buildManifest(script, slug, audio);
    await writeJson(paths.manifest, manifest);
    manifest.scenes.forEach((s, i) =>
      report.info(
        `scene ${i + 1} (${s.scene.type}): ${s.durationInFrames} frames, ${s.captions.cues.length} caption words`,
      ),
    );
    const total = manifest.scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
    report.info(`total ${total} frames (${(total / manifest.fps).toFixed(1)}s at ${manifest.fps} fps) -> ${paths.manifest}`);
    return manifest;
  });

const renderSteps = async (report: Reporter, manifest: Manifest, options: Options) => {
  const { preset } = options;
  const paths = pipelinePaths(manifest.slug);
  const compositionId = `ExplainerVideo-${preset}`;
  const browserExecutable = options.browserExecutable ?? process.env[BROWSER_EXECUTABLE_ENV];

  await report.step(`Render video (${preset})`, async () => {
    const props: ExplainerVideoProps = { manifest, preset, withAudio: true };
    await writeJson(paths.props(preset, "video"), props);
    await runRemotion("render", compositionId, paths.video(preset), [], {
      propsPath: paths.props(preset, "video"),
      browserExecutable,
    });
    report.info(`-> ${paths.video(preset)}`);
  });

  await report.step(`Render thumbnail (${preset})`, async () => {
    const frame = thumbnailFrame(manifest);
    const props: ExplainerVideoProps = { manifest, preset, withAudio: false, withCaptions: false };
    await writeJson(paths.props(preset, "still"), props);
    await runRemotion("still", compositionId, paths.thumbnail(preset), [`--frame=${frame}`], {
      propsPath: paths.props(preset, "still"),
      browserExecutable,
    });
    report.info(`frame ${frame} of the title scene -> ${paths.thumbnail(preset)}`);
  });

  await report.step("Write captions (.srt)", async () => {
    const srt = manifestToSrt(manifest);
    await writeFile(paths.srt, srt);
    report.info(`${srt.split("\n\n").filter(Boolean).length} cues -> ${paths.srt}`);
  });
};

const metadataStep = (report: Reporter, script: Script, slug: string) =>
  report.step("Write upload metadata", async () => {
    const paths = pipelinePaths(slug);
    const meta = buildUploadMetadata(script);
    await mkdir(paths.outDir, { recursive: true });
    await writeFile(paths.upload, renderUploadMarkdown(script, meta));
    report.info(`${meta.titles.length} titles, ${meta.hashtags.length} hashtags -> ${paths.upload}`);
  });

/** Every .yaml or .yml file in scripts/, sorted by name. */
const allScriptPaths = async (dir = SCRIPTS_DIR): Promise<string[]> =>
  (await readdir(dir))
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => join(dir, f));

/** Runs `metadata` for every script; a broken script is reported and the rest still run. */
const runMetadataAll = async (): Promise<number> => {
  const paths = await allScriptPaths();
  if (paths.length === 0) throw new CliError(`No .yaml scripts found in ${SCRIPTS_DIR}/`);
  const failed: string[] = [];
  for (const path of paths) {
    try {
      await commands.metadata.run(createReporter(commands.metadata.steps), path);
    } catch (err) {
      if (!(err instanceof CliError)) throw err;
      console.error(`\nError: ${err.message}`);
      failed.push(path);
    }
  }
  const ok = paths.length - failed.length;
  console.log(`\nWrote upload metadata for ${ok} of ${paths.length} scripts.`);
  if (failed.length > 0) console.error(`Failed: ${failed.join(", ")}`);
  return failed.length > 0 ? 1 : 0;
};

/** The designed stills: 1280x720 thumbnail and 1080x1920 Shorts cover. Needs no audio. */
const thumbnailSteps = async (
  report: Reporter,
  script: Script,
  slug: string,
  browserExecutable = process.env[BROWSER_EXECUTABLE_ENV],
) => {
  const paths = pipelinePaths(slug);
  const props: ThumbnailProps = { script };
  await writeJson(paths.thumbnailProps, props);
  const stills = [
    { label: "Render thumbnail (1280x720)", id: thumbnailCompositionIds.landscape, out: paths.thumbnailImage },
    { label: "Render Shorts cover (1080x1920)", id: thumbnailCompositionIds.cover, out: paths.cover },
  ];
  for (const { label, id, out } of stills) {
    await report.step(label, async () => {
      await runRemotion("still", id, out, [], { propsPath: paths.thumbnailProps, browserExecutable });
      report.info(`-> ${out}`);
    });
  }
};

const commands = {
  validate: { steps: 1, run: async (r: Reporter, path: string) => void (await validateStep(r, path)) },
  voice: {
    steps: 2,
    run: async (r: Reporter, path: string, o: Options) => {
      const { script, slug } = await validateStep(r, path);
      await voiceStep(r, script, slug, o);
    },
  },
  "build-manifest": {
    steps: 2,
    run: async (r: Reporter, path: string) => {
      const { script, slug } = await validateStep(r, path);
      await manifestStep(r, script, slug);
    },
  },
  thumbnail: {
    steps: 3,
    run: async (r: Reporter, path: string, o: Options) => {
      const { script, slug } = await validateStep(r, path);
      await thumbnailSteps(r, script, slug, o.browserExecutable);
    },
  },
  render: {
    steps: 8,
    run: async (r: Reporter, path: string, o: Options) => {
      const { script, slug } = await validateStep(r, path);
      await voiceStep(r, script, slug, o);
      const manifest = await manifestStep(r, script, slug);
      await renderSteps(r, manifest, o);
      await thumbnailSteps(r, script, slug, o.browserExecutable);
      console.log(`\nFinished: ${pipelinePaths(slug).outDir}/`);
    },
  },
  metadata: {
    steps: 2,
    run: async (r: Reporter, path: string) => {
      const { script, slug } = await validateStep(r, path);
      await metadataStep(r, script, slug);
    },
  },
} as const;

const isCommand = (name: string): name is keyof typeof commands => name in commands;

const parseOptions = (argv: string[]): { positionals: string[]; options: Options } => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      provider: { type: "string", default: "mock" },
      voice: { type: "string" },
      speed: { type: "string" },
      preset: { type: "string", default: "short" },
      "browser-executable": { type: "string" },
      all: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return { positionals: ["--help"], options: { provider: "mock", preset: "short" } };
  if (!isTtsProviderName(values.provider)) {
    throw new CliError(`Unknown provider "${values.provider}". Use one of: ${ttsProviderNames.join(", ")}.`);
  }
  const speed = values.speed === undefined ? undefined : Number(values.speed);
  if (speed !== undefined && !(speed >= MIN_SPEED && speed <= MAX_SPEED)) {
    throw new CliError(`--speed must be a number from ${MIN_SPEED} to ${MAX_SPEED}, got "${values.speed}".`);
  }
  if (!(presetNames as readonly string[]).includes(values.preset)) {
    throw new CliError(`Unknown preset "${values.preset}". Use one of: ${presetNames.join(", ")}.`);
  }
  return {
    positionals,
    options: {
      provider: values.provider,
      voice: values.voice,
      speed,
      preset: values.preset as PresetName,
      browserExecutable: values["browser-executable"],
      all: values.all,
    },
  };
};

const main = async (argv: string[]): Promise<number> => {
  try {
    loadDotEnv();
    const { positionals, options } = parseOptions(argv);
    const [command, path] = positionals;
    if (!command || command === "--help") {
      console.log(usage);
      return command ? 0 : 1;
    }
    if (!isCommand(command)) throw new CliError(`Unknown command: ${command}\n\n${usage}`);
    if (options.all) {
      if (command !== "metadata") throw new CliError(`--all only works with metadata, not ${command}.`);
      if (path) throw new CliError("metadata: pass a script path or --all, not both.");
      return await runMetadataAll();
    }
    if (!path) throw new CliError(`${command}: missing script path\n\n${usage}`);
    const { steps, run } = commands[command];
    await run(createReporter(steps), path, options);
    return 0;
  } catch (err) {
    if (err instanceof CliError || (err instanceof Error && err.name === "TtsError")) {
      console.error(`\nError: ${err.message}`);
      return 1;
    }
    if (err instanceof TypeError && "code" in err && String(err.code).startsWith("ERR_PARSE_ARGS")) {
      console.error(`\nError: ${err.message}\n\n${usage}`);
      return 1;
    }
    throw err;
  }
};

process.exitCode = await main(process.argv.slice(2));
