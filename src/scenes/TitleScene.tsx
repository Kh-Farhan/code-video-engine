import React, { useEffect, useMemo, useState } from "react";
import { interpolate, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import type { CodeToken } from "../components/codeLayout";
import { tokenizeCode } from "../components/highlighter";
import type { TitleScene as TitleSceneData } from "../schema/script";
import { colors, fonts, presets, spacing } from "../theme";
import { enter, riseIn } from "./animation";
import { SceneFrame } from "./SceneFrame";
import { beats, framesAt } from "./timing";
import {
  CODE_PILL_LINE_HEIGHT,
  CODE_PILL_PADDING_EM,
  CODE_PILL_PADDING_Y_EM,
  HEADING_LETTER_SPACING_EM,
  SUBHEADING_LINE_HEIGHT,
  TITLE_BAR,
  titleHeadingLayout,
  type HeadingRun,
} from "./titleHeading";
import type { SceneProps } from "./types";

/** Scale the heading settles from. Close to 1, so frame 0 already reads. */
export const TITLE_HEADING_START_SCALE = 0.96;
/** Width the accent bar grows from, as a share of its full width. */
const BAR_START = 0.4;

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
      display: "inline-block",
      lineHeight: CODE_PILL_LINE_HEIGHT,
      padding: `${CODE_PILL_PADDING_Y_EM}em ${CODE_PILL_PADDING_EM}em`,
      borderRadius: "0.14em",
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      boxShadow: `inset 0 0 0 2px ${colors.border}`,
    }}
  >
    {tokens
      ? tokens.map((t, i) => (
          <span key={i} style={{ color: t.color ?? colors.textStrong }}>
            {t.content}
          </span>
        ))
      : run.text}
  </span>
);

/**
 * The hook. On a Short most viewers decide in the first second, so the
 * heading is fully readable on frame 0: as large as fits (about 85% of the
 * frame width in `short`, at most 3 lines), centered in the visual zone,
 * and it only settles from a slight zoom. Code in the heading is drawn in
 * the code font with syntax colors. The subheading follows a beat later.
 */
export const TitleScene: React.FC<SceneProps<TitleSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fontSize } = presets[preset];

  const layout = useMemo(
    () => titleHeadingLayout(scene.heading, preset, !!scene.subheading),
    [scene.heading, preset, scene.subheading],
  );
  const codeRuns = useMemo(
    () => layout.lines.flatMap((line) => line.filter((r) => r.code).map((r) => r.text)),
    [layout],
  );
  const tokens = useRunTokens(codeRuns);

  const settle = enter(frame, fps, 0);
  const scale = interpolate(settle, [0, 1], [TITLE_HEADING_START_SCALE, 1]);
  const bar = interpolate(enter(frame, fps, 0, true), [0, 1], [BAR_START, 1]);
  const subheading = enter(frame, fps, framesAt(fps, beats.secondary));

  // Index of each line's first code run among all code runs, to find its tokens.
  const firstCode = layout.lines.map((_, i) =>
    layout.lines.slice(0, i).reduce((n, line) => n + line.filter((r) => r.code).length, 0),
  );
  return (
    <SceneFrame
      preset={preset}
      durationInFrames={durationInFrames}
      align="center"
      transitionIn={false}
    >
      <div
        style={{
          width: preset === "short" ? 160 : 200,
          height: TITLE_BAR.height,
          borderRadius: TITLE_BAR.height / 2,
          marginBottom: TITLE_BAR.gap,
          background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentAlt})`,
          transform: `scaleX(${bar})`,
          transformOrigin: "center",
          flexShrink: 0,
        }}
      />
      <h1
        style={{
          margin: 0,
          width: layout.maxWidth,
          flexShrink: 0,
          fontFamily: fonts.sans,
          fontWeight: 800,
          fontSize: layout.fontSize,
          lineHeight: layout.lineHeight,
          letterSpacing: `${HEADING_LETTER_SPACING_EM}em`,
          color: colors.textStrong,
          textAlign: "center",
          textShadow: "0 6px 28px rgba(0, 0, 0, 0.55)",
          transform: `scale(${scale})`,
          transformOrigin: "center",
        }}
      >
        {layout.lines.map((line, i) => (
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
        ))}
      </h1>
      {scene.subheading ? (
        <p
          style={{
            margin: 0,
            marginTop: spacing.lg,
            fontFamily: fonts.sans,
            fontWeight: 600,
            fontSize: fontSize.subheading,
            lineHeight: SUBHEADING_LINE_HEIGHT,
            color: colors.textMuted,
            textAlign: "center",
            maxWidth: layout.maxWidth,
            ...riseIn(subheading, 24),
          }}
        >
          {scene.subheading}
        </p>
      ) : null}
    </SceneFrame>
  );
};
