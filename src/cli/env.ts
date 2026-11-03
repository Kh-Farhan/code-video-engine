import { existsSync } from "node:fs";

/**
 * Loads KEY=value lines from `.env` into process.env, if the file exists.
 * Variables already set in the shell win over the file.
 */
export const loadDotEnv = (path = ".env"): boolean => {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
};
