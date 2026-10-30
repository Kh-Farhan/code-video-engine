import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { CodeLanguage } from "../schema/script";
import { codeTheme } from "../theme";
import type { CodeToken } from "./codeLayout";

/**
 * Shiki with only the grammars the script schema allows, loaded on demand.
 * Uses the JavaScript regex engine so the bundle needs no WebAssembly.
 */

const grammars: Record<CodeLanguage, () => Promise<{ default: unknown }>> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
};

let highlighter: Promise<HighlighterCore> | undefined;
const loadedLanguages = new Map<CodeLanguage, Promise<void>>();
const tokenCache = new Map<string, Promise<CodeToken[][]>>();

const getHighlighter = (): Promise<HighlighterCore> =>
  (highlighter ??= createHighlighterCore({
    themes: [import("shiki/themes/tokyo-night.mjs")],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  }));

const ensureLanguage = (h: HighlighterCore, language: CodeLanguage) => {
  let loading = loadedLanguages.get(language);
  if (!loading) {
    loading = grammars[language]().then((mod) =>
      h.loadLanguage(mod.default as Parameters<HighlighterCore["loadLanguage"]>[0]),
    );
    loadedLanguages.set(language, loading);
  }
  return loading;
};

/** Tokenizes code into lines of colored runs. Results are cached per code and language. */
export const tokenizeCode = (
  code: string,
  language: CodeLanguage,
): Promise<CodeToken[][]> => {
  const key = `${language}\u0000${code}`;
  let result = tokenCache.get(key);
  if (!result) {
    result = getHighlighter().then(async (h) => {
      await ensureLanguage(h, language);
      return h
        .codeToTokens(code, { lang: language, theme: codeTheme })
        .tokens.map((line) =>
          line.map(({ content, color, fontStyle }) => ({ content, color, fontStyle })),
        );
    });
    tokenCache.set(key, result);
  }
  return result;
};
