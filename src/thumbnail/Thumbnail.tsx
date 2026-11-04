import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, useDelayRender, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { LINE_HEIGHT_EM, type CodeToken } from "../components/codeLayout";
import { tokenizeCode } from "../components/highlighter";
import type { Script } from "../schema/script";
import { colors, DEFAULT_LOOK, fonts, radius, spacing } from "../theme";
import type { CodeSnippet } from "./content";
import { formatForSize, thumbnailContent, type ThumbnailFormat } from "./layout";

export type ThumbnailProps = {
  script: Script;
};

/**
 * A still for the video: punchy headline, topic tag and a cropped code
 * snippet. Picks the landscape thumbnail or the Shorts cover layout from the
 * composition size.
 */
export const Thumbnail: React.FC<ThumbnailProps> = ({ script }) => {
  const { width, height } = useVideoConfig();
  const format = formatForSize(width, height);
  const content = useMemo(() => thumbnailContent(script, format), [script, format]);
  const look = script.style?.look ?? DEFAULT_LOOK;
  const cover = format.name === "cover";

  const tag = content.tag ? <Tag {...content.tag} format={format} /> : null;
  const headline = <Headline {...content.headline} format={format} />;
  const code = content.snippet ? <SnippetCard snippet={content.snippet} format={format} /> : null;
  const handle = content.handle ? <Handle handle={content.handle} format={format} /> : null;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, overflow: "hidden" }}>
      <Backdrop look={look} />
      {/* Darkens behind the text so it stays readable over any look. */}
      <AbsoluteFill
        style={{
          background: cover
            ? `linear-gradient(180deg, rgba(11, 15, 23, 0.25) 0%, rgba(11, 15, 23, 0.7) 45%, rgba(11, 15, 23, 0.35) 100%)`
            : `linear-gradient(90deg, rgba(11, 15, 23, 0.85) 0%, rgba(11, 15, 23, 0.6) 55%, rgba(11, 15, 23, 0.1) 100%)`,
        }}
      />
      {cover ? (
        <AbsoluteFill
          style={{
            padding: format.padding,
            paddingTop: Math.round(format.height * 0.12),
            paddingBottom: Math.round(format.height * 0.2),
            justifyContent: "center",
            gap: spacing.lg,
          }}
        >
          {handle ? <div style={{ alignSelf: "center", marginBottom: spacing.md }}>{handle}</div> : null}
          {tag}
          {headline}
          {code ? <div style={{ marginTop: spacing.md }}>{code}</div> : null}
        </AbsoluteFill>
      ) : (
        <>
          {code ? (
            <div style={{ position: "absolute", left: format.code.left, top: format.code.top }}>
              {code}
            </div>
          ) : null}
          <AbsoluteFill
            style={{
              padding: format.padding,
              width: format.textWidth + 2 * format.padding,
              justifyContent: "center",
              gap: spacing.md,
            }}
          >
            {tag}
            {headline}
          </AbsoluteFill>
          {handle ? (
            <div style={{ position: "absolute", left: format.padding, bottom: format.padding * 0.6 }}>
              {handle}
            </div>
          ) : null}
        </>
      )}
    </AbsoluteFill>
  );
};

const Tag: React.FC<{ text: string; fontSize: number; format: ThumbnailFormat }> = ({
  text,
  fontSize,
  format,
}) => (
  <div
    style={{
      alignSelf: "flex-start",
      padding: `${Math.round(fontSize * 0.35)}px ${format.tag.padX}px`,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      color: colors.background,
      fontFamily: fonts.sans,
      fontWeight: 800,
      fontSize,
      lineHeight: 1.1,
      letterSpacing: `${format.tag.letterSpacingEm}em`,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

const Headline: React.FC<{
  lines: string[];
  fontSize: number;
  accentWord: number;
  format: ThumbnailFormat;
}> = ({ lines, fontSize, accentWord, format }) => {
  let index = 0;
  return (
    <h1
      style={{
        margin: 0,
        fontFamily: fonts.sans,
        fontWeight: 800,
        fontSize,
        lineHeight: format.headline.lineHeight,
        letterSpacing: `${format.headline.letterSpacingEm}em`,
        color: colors.text,
        textShadow: `0 ${Math.round(fontSize * 0.05)}px ${Math.round(fontSize * 0.2)}px rgba(0, 0, 0, 0.6)`,
        whiteSpace: "nowrap",
      }}
    >
      {lines.map((line, i) => (
        <div key={i}>
          {line.split(" ").map((word, j) => {
            const accent = index++ === accentWord;
            return (
              <React.Fragment key={j}>
                {j > 0 ? " " : null}
                <span style={accent ? { color: colors.captionHighlight } : undefined}>{word}</span>
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </h1>
  );
};

const Handle: React.FC<{ handle: string; format: ThumbnailFormat }> = ({ handle, format }) => (
  <div
    style={{
      fontFamily: fonts.sans,
      fontWeight: 700,
      fontSize: format.brandFontSize,
      color: colors.text,
      opacity: 0.9,
      padding: `${spacing.xs}px ${spacing.md}px`,
      borderRadius: 999,
      backgroundColor: "rgba(11, 15, 23, 0.6)",
      border: `2px solid rgba(122, 162, 247, 0.4)`,
    }}
  >
    {handle}
  </div>
);

const tokenColor = (token: CodeToken) => token.color ?? colors.text;

/** Drops the first `count` characters of a line's tokens. */
const dropLeading = (tokens: CodeToken[], count: number): CodeToken[] => {
  let left = count;
  const out: CodeToken[] = [];
  for (const token of tokens) {
    if (left >= token.content.length) {
      left -= token.content.length;
      continue;
    }
    out.push({ ...token, content: token.content.slice(left) });
    left = 0;
  }
  return out;
};

/** Shiki tokens for the snippet's code, holding the render until they are ready. */
const useSnippetTokens = (snippet: CodeSnippet): CodeToken[][] | undefined => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Highlighting ${snippet.language} thumbnail code`));
  const [tokens, setTokens] = useState<CodeToken[][]>();
  useEffect(() => {
    let active = true;
    tokenizeCode(snippet.code, snippet.language)
      .then((t) => {
        if (active) setTokens(t);
        continueRender(handle);
      })
      .catch((err: unknown) => cancelRender(err));
    return () => {
      active = false;
    };
  }, [snippet.code, snippet.language, handle, continueRender, cancelRender]);
  return tokens;
};

/** A tilted editor window with a few lines of code, cropped by the frame edge. */
const SnippetCard: React.FC<{ snippet: CodeSnippet; format: ThumbnailFormat }> = ({
  snippet,
  format,
}) => {
  const tokens = useSnippetTokens(snippet);
  const { fontSize, width, rotateDeg } = format.code;
  const lineHeight = Math.round(fontSize * LINE_HEIGHT_EM);
  const sourceLines = snippet.code.split("\n");
  const rows: CodeToken[][] = [];
  for (let line = snippet.start; line < snippet.end; line++) {
    const lineTokens = tokens?.[line] ?? [{ content: sourceLines[line] ?? "" }];
    rows.push(dropLeading(lineTokens, snippet.indent));
  }
  const dot = Math.round(fontSize * 0.55);

  return (
    <div
      style={{
        width,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        border: `2px solid ${colors.border}`,
        boxShadow: `0 ${fontSize}px ${fontSize * 3}px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(122, 162, 247, 0.15)`,
        transform: `rotate(${rotateDeg}deg)`,
        transformOrigin: "left top",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: Math.round(dot * 0.8),
          padding: `${Math.round(fontSize * 0.6)}px ${Math.round(fontSize)}px`,
          backgroundColor: colors.surfaceRaised,
          borderBottom: `2px solid ${colors.border}`,
        }}
      >
        {[colors.danger, colors.warning, colors.success].map((c) => (
          <div key={c} style={{ width: dot, height: dot, borderRadius: "50%", backgroundColor: c }} />
        ))}
        <div
          style={{
            marginLeft: spacing.sm,
            fontFamily: fonts.mono,
            fontSize: Math.round(fontSize * 0.75),
            color: colors.textMuted,
          }}
        >
          {snippet.language}
        </div>
      </div>
      <div
        style={{
          padding: `${Math.round(fontSize * 0.7)}px 0`,
          fontFamily: fonts.mono,
          fontSize,
          lineHeight: `${lineHeight}px`,
          whiteSpace: "pre",
          fontVariantLigatures: "none",
          // Fade the cropped edges instead of cutting them hard.
          maskImage: "linear-gradient(90deg, #000 70%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(90deg, #000 70%, transparent 100%)",
        }}
      >
        {rows.map((row, i) => {
          const highlighted = snippet.highlighted.includes(snippet.start + i);
          return (
            <div
              key={i}
              style={{
                height: lineHeight,
                paddingLeft: Math.round(fontSize),
                backgroundColor: highlighted ? colors.highlight : undefined,
                boxShadow: highlighted ? `inset 6px 0 0 ${colors.accent}` : undefined,
                opacity: snippet.highlighted.length > 0 && !highlighted ? 0.75 : 1,
              }}
            >
              {row.map((token, j) => (
                <span key={j} style={{ color: tokenColor(token) }}>
                  {token.content}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
