import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { parse } from "yaml";
import { parseScript, type ParseResult, type Script } from "../schema/script";

/** Slug is the script file name without extension: scripts/example-usememo.yaml -> example-usememo. */
export const slugFromPath = (path: string): string =>
  basename(path, extname(path));

/** Parses YAML text and validates it. YAML syntax errors are reported like schema errors. */
export const parseScriptYaml = (text: string): ParseResult<Script> => {
  let data: unknown;
  try {
    data = parse(text);
  } catch (err) {
    return {
      success: false,
      errors: [`(yaml): ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  return parseScript(data);
};

export const loadScriptFile = (path: string): ParseResult<Script> =>
  parseScriptYaml(readFileSync(path, "utf8"));
