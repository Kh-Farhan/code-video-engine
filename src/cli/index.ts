import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { Manifest } from "../schema/manifest";
import type { Script } from "../schema/script";
import type { ExplainerVideoProps } from "../scenes/explainerMetadata";
import { presetNames, type PresetName } from "../theme";
import { isTtsProviderName, ttsProviderNames } from "../tts";
import { loadScriptFile, slugFromPath } from "./loadScript";
import { buildManifest, manifestToSrt, thumbnailFrame, writeJson } from "./manifest";
import { pipelinePaths } from "./paths";
import { CliError, createReporter, type Reporter } from "./progress";
import { BROWSER_EXECUTABLE_ENV, runRemotion } from "./remotion";
import { loadSceneAudio, runVoice } from "./voice";

const usage = `Usage:
  pnpm video validate scripts/<slug>.yaml
  pnpm video voice scripts/<slug>.yaml [--provider mock|elevenlabs|gemini]
  pnpm video build-manifest scripts/<slug>.yaml
  pnpm video render scripts/<slug>.yaml [--preset short|long] [--provider mock|elevenlabs|gemini]

Options:
  --provider            TTS provider (default: mock)
  --preset              Output format: short is 1080x1920, long is 1920x1080 (default: short)
  --browser-executable  Chrome or Chromium binary for rendering. Also read from ${BROWSER_EXECUTABLE_ENV}.

Output:
  public/audio/<slug>/          generated narration and voice.json
  out/<slug>/manifest.json      render manifest
  out/<slug>/<slug>-<preset>.mp4, <slug>-<preset>-thumbnail.png, <slug>.srt`;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Options = {
  provider: string;
  preset: PresetName;
  browserExecutable?: string;
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
    return { script: result.data, slug };
  });

const voiceStep = (report: Reporter, script: Script, slug: string, provider: string) =>
  report.step(`Generate narration (${provider})`, () =>
    runVoice(script, slug, provider, pipelinePaths(slug), report),
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

const commands = {
  validate: { steps: 1, run: async (r: Reporter, path: string) => void (await validateStep(r, path)) },
  voice: {
    steps: 2,
    run: async (r: Reporter, path: string, o: Options) => {
      const { script, slug } = await validateStep(r, path);
      await voiceStep(r, script, slug, o.provider);
    },
  },
  "build-manifest": {
    steps: 2,
    run: async (r: Reporter, path: string) => {
      const { script, slug } = await validateStep(r, path);
      await manifestStep(r, script, slug);
    },
  },
  render: {
    steps: 6,
    run: async (r: Reporter, path: string, o: Options) => {
      const { script, slug } = await validateStep(r, path);
      await voiceStep(r, script, slug, o.provider);
      const manifest = await manifestStep(r, script, slug);
      await renderSteps(r, manifest, o);
      console.log(`\nFinished: ${pipelinePaths(slug).outDir}/`);
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
      preset: { type: "string", default: "short" },
      "browser-executable": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return { positionals: ["--help"], options: { provider: "mock", preset: "short" } };
  if (!isTtsProviderName(values.provider)) {
    throw new CliError(`Unknown provider "${values.provider}". Use one of: ${ttsProviderNames.join(", ")}.`);
  }
  if (!(presetNames as readonly string[]).includes(values.preset)) {
    throw new CliError(`Unknown preset "${values.preset}". Use one of: ${presetNames.join(", ")}.`);
  }
  return {
    positionals,
    options: {
      provider: values.provider,
      preset: values.preset as PresetName,
      browserExecutable: values["browser-executable"],
    },
  };
};

const main = async (argv: string[]): Promise<number> => {
  try {
    const { positionals, options } = parseOptions(argv);
    const [command, path] = positionals;
    if (!command || command === "--help") {
      console.log(usage);
      return command ? 0 : 1;
    }
    if (!isCommand(command)) throw new CliError(`Unknown command: ${command}\n\n${usage}`);
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
