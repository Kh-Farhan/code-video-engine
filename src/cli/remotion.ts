import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CliError } from "./progress";

/** Remotion entry point, relative to the repo root. */
export const REMOTION_ENTRY = "src/index.ts";

/** Optional path to a local Chrome / Chromium, for machines where Remotion cannot download one. */
export const BROWSER_EXECUTABLE_ENV = "REMOTION_BROWSER_EXECUTABLE";

const remotionCliPath = (): string => {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("@remotion/cli/package.json")), "remotion-cli.js");
};

export type RemotionRunOptions = {
  propsPath: string;
  browserExecutable?: string;
};

/**
 * Runs the Remotion CLI (`render` or `still`) in a child process with its
 * output passed through, so its own progress bar shows up.
 */
export const runRemotion = (
  command: "render" | "still",
  compositionId: string,
  outputPath: string,
  extraArgs: string[],
  { propsPath, browserExecutable }: RemotionRunOptions,
): Promise<void> => {
  const args = [
    remotionCliPath(),
    command,
    REMOTION_ENTRY,
    compositionId,
    outputPath,
    `--props=${propsPath}`,
    ...(browserExecutable ? [`--browser-executable=${browserExecutable}`] : []),
    ...extraArgs,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("error", (err) => reject(new CliError(`Could not start Remotion: ${err.message}`)));
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new CliError(
            `remotion ${command} ${compositionId} failed (${signal ?? `exit code ${code}`}). See the Remotion output above.`,
          ),
        );
    });
  });
};
