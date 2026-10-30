import { loadScriptFile, slugFromPath } from "./loadScript";

const usage = `Usage:
  pnpm video validate scripts/<slug>.yaml
  pnpm video voice scripts/<slug>.yaml --provider mock|elevenlabs|gemini
  pnpm video build-manifest scripts/<slug>.yaml
  pnpm video render scripts/<slug>.yaml --preset short|long`;

const validate = (path: string): number => {
  const result = loadScriptFile(path);
  if (!result.success) {
    console.error(`${path} is invalid:`);
    for (const line of result.errors) console.error(`  ${line}`);
    return 1;
  }
  console.log(
    `${path} is valid: "${result.data.title}" (${slugFromPath(path)}), ${result.data.scenes.length} scenes`,
  );
  return 0;
};

const notImplemented = (command: string): number => {
  console.error(`${command}: not implemented`);
  return 1;
};

const main = (argv: string[]): number => {
  const [command, path] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(usage);
    return command ? 0 : 1;
  }
  if (!path) {
    console.error(`${command}: missing script path\n\n${usage}`);
    return 1;
  }
  switch (command) {
    case "validate":
      return validate(path);
    case "voice":
    case "build-manifest":
    case "render":
      return notImplemented(command);
    default:
      console.error(`Unknown command: ${command}\n\n${usage}`);
      return 1;
  }
};

process.exitCode = main(process.argv.slice(2));
