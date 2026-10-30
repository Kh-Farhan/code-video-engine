import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDelayRender } from "remotion";
import type { CodeLanguage } from "../schema/script";
import { colors, fonts, presets, type PresetName } from "../theme";
import {
  buildRows,
  layoutCode,
  normalizeCode,
  WRAP_INDENT,
  type CodeLayout,
  type CodeToken,
} from "./codeLayout";
import { tokenizeCode } from "./highlighter";

/** Smallest font size, as a fraction of the preset's code size, before long lines wrap. */
const minFontScale: Record<PresetName, number> = {
  // Phones: keep code large and wrap instead.
  short: 0.85,
  long: 0.7,
};

export type CodeBlockProps = {
  code: string;
  language: CodeLanguage;
  preset: PresetName;
  /** Box the code must fit in, in px. The block never grows past it. */
  maxWidth: number;
  maxHeight: number;
  /** Characters to show, for typing. Shows everything when omitted. */
  visibleChars?: number;
  /** Draws a caret after the last visible character. */
  cursorVisible?: boolean;
  /** Layers drawn over the code, positioned in the same box as the rows. */
  renderOverlay?: (layout: CodeLayout) => React.ReactNode;
};

const plainTokens = (code: string): CodeToken[][] =>
  code.split("\n").map((line) => [{ content: line }]);

const tokenStyle = (token: CodeToken): React.CSSProperties => ({
  color: token.color ?? colors.text,
  fontStyle: token.fontStyle && token.fontStyle & 1 ? "italic" : undefined,
  fontWeight: token.fontStyle && token.fontStyle & 2 ? 700 : undefined,
  textDecoration: token.fontStyle && token.fontStyle & 4 ? "underline" : undefined,
});

/** Syntax-highlighted code, scaled and wrapped so it always fits its box. */
export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  preset,
  maxWidth,
  maxHeight,
  visibleChars,
  cursorVisible = false,
  renderOverlay,
}) => {
  const source = useMemo(() => normalizeCode(code), [code]);
  const tokens = useHighlightedTokens(source, language);

  const baseFontSize = presets[preset].fontSize.code;
  const layout = useMemo(
    () =>
      layoutCode({
        lines: source.split("\n"),
        width: maxWidth,
        height: maxHeight,
        baseFontSize,
        minFontSize: baseFontSize * minFontScale[preset],
      }),
    [source, maxWidth, maxHeight, baseFontSize, preset],
  );
  const { rows, cursor } = useMemo(
    () => buildRows(tokens, layout.cols, visibleChars),
    [tokens, layout.cols, visibleChars],
  );

  return (
    <div
      style={{
        position: "relative",
        width: layout.contentWidth,
        height: layout.contentHeight,
        fontFamily: fonts.mono,
        fontSize: layout.fontSize,
        lineHeight: `${layout.lineHeight}px`,
        whiteSpace: "pre",
        // Ligatures would change the glyph count per row.
        fontVariantLigatures: "none",
      }}
    >
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: i * layout.lineHeight,
            left: row.continuation ? WRAP_INDENT * layout.charWidth : 0,
            height: layout.lineHeight,
            zIndex: 1,
          }}
        >
          {row.tokens.map((token, j) => (
            <span key={j} style={tokenStyle(token)}>
              {token.content}
            </span>
          ))}
        </div>
      ))}
      {cursorVisible ? (
        <div
          style={{
            position: "absolute",
            top: cursor.row * layout.lineHeight + layout.lineHeight * 0.15,
            left: cursor.col * layout.charWidth,
            width: Math.max(2, layout.fontSize * 0.08),
            height: layout.lineHeight * 0.7,
            backgroundColor: colors.accent,
            zIndex: 1,
          }}
        />
      ) : null}
      {renderOverlay?.(layout)}
    </div>
  );
};

/** Tokenizes with Shiki, holding the render until the tokens are ready. */
const useHighlightedTokens = (
  source: string,
  language: CodeLanguage,
): CodeToken[][] => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [result, setResult] = useState<{ key: string; tokens: CodeToken[][] }>();
  const key = `${language}\u0000${source}`;
  const label = `Highlighting ${language} code`;
  // Taken during the first render so no frame is captured before highlighting.
  const [initialHandle] = useState(() => delayRender(label));
  const initialPending = useRef(true);

  useEffect(() => {
    const handle = initialPending.current ? initialHandle : delayRender(label);
    initialPending.current = false;
    let active = true;
    tokenizeCode(source, language)
      .then((tokens) => {
        if (active) setResult({ key, tokens });
        continueRender(handle);
      })
      .catch((err: unknown) => cancelRender(err));
    return () => {
      active = false;
    };
  }, [key, source, language, label, initialHandle, delayRender, continueRender, cancelRender]);

  return result?.key === key ? result.tokens : plainTokens(source);
};
