import React, { useEffect, useMemo, useState } from "react";
import { interpolate, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import type { CodeToken } from "../components/codeLayout";
import { tokenizeCode } from "../components/highlighter";
import type { TitleScene as TitleSceneData } from "../schema/script";
import { colors, fonts } from "../theme";
import { enter } from "./animation";
import { SceneFrame } from "./SceneFrame";
import {
  ARROW_WIDTH_EM,
  CODE_PILL_LINE_HEIGHT,
  CODE_PILL_PADDING_EM,
  CODE_PILL_PADDING_Y_EM,
  codeHeadingLayout,
  HEADING_LETTER_SPACING_EM,
  titleBlock,
  titleHeadingLayout,
  TOPIC_TAG,
  TOPIC_TAG_LINE_HEIGHT,
  type CodeHeadingLayout,
  type HeadingRun,
} from "./titleHeading";
import type { SceneProps } from "./types";

/** Scale the heading settles from. Close to 1, so frame 0 already reads. */
export const TITLE_HEADING_START_SCALE = 0.96;
/** The surprising part of a code heading's result. */
const SURPRISE_COLOR = colors.danger;
const SURPRISE_PAD_EM = 0.08;
/** Code is shown as typed: no "===" or "=>" ligatures, so widths match the measurement. */
const NO_LIGATURES: React.CSSProperties = { fontVariantLigatures: "none", fontFeatureSettings: '"calt" 0, "liga" 0' };

/**
 * Shiki tokens for every code run of the heading, one line of tokens per
 * run, holding the render until they are ready so frame 0 is colored.
 */
const useRunTokens = (code: readonly string[]): CodeToken[][] | undefined => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const joined = code.join("\n");
  const [handle] = useState(() =>
    code.length > 0 ? delayRender("Highlighting code in the title heading") : undefined,
  );
  const [tokens, setTokens] = useState<CodeToken[][]>();
  useEffect(() => {
    if (joined === "") return;
    let active = true;
    tokenizeCode(joined, "javascript")
      .then((t) => {
        if (active) setTokens(t);
        if (handle !== undefined) continueRender(handle);
      })
      .catch((err: unknown) => cancelRender(err));
    return () => {
      active = false;
    };
  }, [joined, handle, continueRender, cancelRender]);
  return joined === "" ? undefined : tokens;
};

const CodeRun: React.FC<{ run: HeadingRun; tokens?: CodeToken[] }> = ({ run, tokens }) => (
  <span
    style={{
      fontFamily: fonts.mono,
      fontWeight: 700,
      letterSpacing: 0,
      ...NO_LIGATURES,
      display: "inline-block",
      lineHeight: CODE_PILL_LINE_HEIGHT,
      padding: `${CODE_PILL_PADDING_Y_EM}em ${CODE_PILL_PADDING_EM}em`,
      borderRadius: "0.14em",
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      boxShadow: `inset 0 0 0 2px ${colors.border}`,
    }}
  >
    {tokens ? <Tokens tokens={tokens} /> : run.text}
  </span>
);

const Tokens: React.FC<{ tokens: readonly CodeToken[]; color?: string }> = ({ tokens, color }) => (
  <>
    {tokens.map((t, i) => (
      <span key={i} style={{ color: color ?? t.color ?? colors.textStrong }}>
        {t.content}
      </span>
    ))}
  </>
);

/** Splits a line of tokens at character offsets `from` and `to`. */
export const splitTokens = (
  tokens: readonly CodeToken[],
  from: number,
  to: number,
): [CodeToken[], CodeToken[], CodeToken[]] => {
  const parts: [CodeToken[], CodeToken[], CodeToken[]] = [[], [], []];
  let at = 0;
  for (const token of tokens) {
    const end = at + token.content.length;
    const cuts = [at, Math.min(end, Math.max(at, from)), Math.min(end, Math.max(at, to)), end];
    for (let k = 0; k < 3; k++) {
      if (cuts[k + 1]! > cuts[k]!) {
        parts[k]!.push({ ...token, content: token.content.slice(cuts[k]! - at, cuts[k + 1]! - at) });
      }
    }
    at = end;
  }
  return parts;
};

/** A thick right arrow in the accent color, sized in em of the heading. */
const Arrow: React.FC = () => (
  <svg
    viewBox="0 0 90 60"
    style={{ width: `${ARROW_WIDTH_EM}em`, height: "0.6em", verticalAlign: "-0.02em", overflow: "visible" }}
  >
    <path
      d="M6 30 H78 M54 8 L80 30 L54 52"
      fill="none"
      stroke={colors.accent}
      strokeWidth={11}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Input on one line, connector and result on the next, at one large size,
 * with the surprising part of the result in the warning color.
 */
const CodeHeadingLines: React.FC<{ layout: CodeHeadingLayout; tokens?: CodeToken[][] }> = ({ layout, tokens }) => {
  const [input, result] = [tokens?.[0], tokens?.[1]];
  const { from, to } = layout.surprise;
  const [before, surprise, after] = result
    ? splitTokens(result, from, to)
    : [[{ content: layout.result.slice(0, from) }], [{ content: layout.result.slice(from, to) }], [{ content: layout.result.slice(to) }]];
  return (
    <>
      <div style={{ whiteSpace: "pre" }}>{input ? <Tokens tokens={input} /> : layout.input}</div>
      <div style={{ whiteSpace: "pre" }}>
        {layout.operator ? <span style={{ color: colors.accent }}>{layout.operator}</span> : <Arrow />}{" "}
        <Tokens tokens={before} />
        <span
          style={{
            // Tight box around the glyphs; the negative margin keeps the measured width.
            display: "inline-block",
            lineHeight: 1,
            padding: `0.06em ${SURPRISE_PAD_EM}em`,
            margin: `0 -${SURPRISE_PAD_EM}em`,
            borderRadius: "0.12em",
            backgroundColor: "rgba(247, 118, 142, 0.18)",
          }}
        >
          <Tokens tokens={surprise} color={SURPRISE_COLOR} />
        </span>
        <Tokens tokens={after} />
      </div>
    </>
  );
};

/**
 * The hook. On a Short most viewers decide in the first second, so the
 * heading is fully readable on frame 0 and only settles from a slight zoom.
 * The block is centered at about 39% of the frame height, inside the
 * visual zone. The subheading becomes a small-caps topic tag above it.
 *
 * Text headings fill about 85% of the frame width in `short`, at most 3
 * lines, with code in them drawn as syntax-colored pills. A code heading
 * ("input gives result") puts the input and the result on separate lines
 * in the bold code font, the longest line at about 90% of the width, joined
 * by an accent arrow (or its operator), with the surprise in red.
 */
export const TitleScene: React.FC<SceneProps<TitleSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hasTag = !!scene.subheading?.trim();

  const code = useMemo(() => codeHeadingLayout(scene.heading, preset, hasTag), [scene.heading, preset, hasTag]);
  const text = useMemo(
    () => (code ? undefined : titleHeadingLayout(scene.heading, preset, hasTag)),
    [code, scene.heading, preset, hasTag],
  );
  const codeLines = useMemo(
    () =>
      code
        ? [code.input, code.result]
        : text!.lines.flatMap((line) => line.filter((r) => r.code).map((r) => r.text)),
    [code, text],
  );
  const tokens = useRunTokens(codeLines);

  const scale = interpolate(enter(frame, fps, 0), [0, 1], [TITLE_HEADING_START_SCALE, 1]);
  const { offsetY } = titleBlock(preset);
  const tag = TOPIC_TAG[preset];

  // Index of each text line's first code run among all code runs, to find its tokens.
  const firstCode = text
    ? text.lines.map((_, i) => text.lines.slice(0, i).reduce((n, line) => n + line.filter((r) => r.code).length, 0))
    : [];
  const fontSize = code ? code.fontSize : text!.fontSize;
  return (
    <SceneFrame
      preset={preset}
      durationInFrames={durationInFrames}
      align="center"
      transitionIn={false}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: `translateY(${offsetY}px)`,
        }}
      >
        {hasTag ? (
          <div
            style={{
              marginBottom: tag.gap,
              fontFamily: fonts.sans,
              fontWeight: 800,
              fontSize: tag.fontSize,
              lineHeight: TOPIC_TAG_LINE_HEIGHT,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              textAlign: "center",
              color: colors.accent,
              maxWidth: code?.maxWidth ?? text!.maxWidth,
            }}
          >
            {scene.subheading}
          </div>
        ) : null}
        <h1
          style={{
            margin: 0,
            width: code?.maxWidth ?? text!.maxWidth,
            flexShrink: 0,
            fontFamily: code ? fonts.mono : fonts.sans,
            fontWeight: 800,
            fontSize,
            lineHeight: code ? code.lineHeight : text!.lineHeight,
            letterSpacing: code ? 0 : `${HEADING_LETTER_SPACING_EM}em`,
            ...(code ? NO_LIGATURES : {}),
            color: colors.textStrong,
            textAlign: "center",
            textShadow: "0 6px 28px rgba(0, 0, 0, 0.55)",
            transform: `scale(${scale})`,
            transformOrigin: "center",
          }}
        >
          {code ? (
            <CodeHeadingLines layout={code} tokens={tokens} />
          ) : (
            text!.lines.map((line, i) => (
              <div key={i} style={{ whiteSpace: "pre" }}>
                {line.map((run, j) =>
                  run.code ? (
                    <CodeRun
                      key={j}
                      run={run}
                      tokens={tokens?.[firstCode[i]! + line.slice(0, j).filter((r) => r.code).length]}
                    />
                  ) : (
                    <span key={j}>{run.text}</span>
                  ),
                )}
              </div>
            ))
          )}
        </h1>
      </div>
    </SceneFrame>
  );
};
