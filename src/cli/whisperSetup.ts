import { downloadWhisperModel, installWhisperCpp } from "@remotion/install-whisper-cpp";
import { whisperConfigFromEnv, whisperStatus } from "../align/whisper";
import { CliError, type Reporter } from "./progress";

/**
 * Installs whisper.cpp and the alignment model with Remotion's helpers:
 * clones and builds whisper.cpp (needs git, make, cmake and a C++ compiler),
 * then downloads the model into the same folder. Safe to run again.
 */
export const runWhisperSetup = async (report: Reporter): Promise<void> => {
  const config = whisperConfigFromEnv();
  await report.step(`Install whisper.cpp ${config.version}`, async () => {
    try {
      const { alreadyExisted } = await installWhisperCpp({ to: config.whisperPath, version: config.version });
      report.info(`${alreadyExisted ? "already installed at" : "built in"} ${config.whisperPath}`);
    } catch (err) {
      throw new CliError(
        `Could not install whisper.cpp: ${err instanceof Error ? err.message : String(err)}\n` +
          "  macOS needs the Xcode command line tools (xcode-select --install) and cmake (brew install cmake).",
      );
    }
  });
  await report.step(`Download model ${config.model}`, async () => {
    try {
      const { alreadyExisted } = await downloadWhisperModel({ model: config.model, folder: config.whisperPath });
      report.info(alreadyExisted ? "already downloaded" : "downloaded");
    } catch (err) {
      throw new CliError(`Could not download the model: ${err instanceof Error ? err.message : String(err)}`);
    }
    const status = whisperStatus(config);
    if (!status.available) throw new CliError(status.reason);
    report.info("caption alignment is on by default for voice and render");
  });
};
