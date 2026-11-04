import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { visualZone } from "../captions/layout";
import { CodeBlock } from "../components/CodeBlock";
import type { CodeLayout } from "../components/codeLayout";
import { LineHighlight } from "../components/LineHighlight";
import { typingEndFrame } from "../components/timing";
import { TypingCode } from "../components/TypingCode";
import type { CodeScene as CodeSceneData } from "../schema/script";
import { colors, fonts, presets, radius, spacing, type PresetName } from "../theme";
import { sceneTransitionStyle } from "./animation";
import { framesAt } from "./timing";
import type { SceneProps } from "./types";

export type CodeSceneProps = SceneProps<CodeSceneData> & {
  /** Shown as an editor tab above the code. */
  filename?: string;
};

const cardPadding: Record<PresetName, number> = { short: spacing.lg, long: 40 };
/** How long the editor card takes to slide in. */
const ENTER_SECONDS = 0.4;

/** A code editor card: optional filename tab, highlighted code, typing and line focus. */
export const CodeScene: React.FC<CodeSceneProps> = ({
  scene,
  preset,
  durationInFrames,
  filename,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width, height, fontSize } = presets[preset];
  const enter = interpolate(frame, [0, framesAt(fps, ENTER_SECONDS)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const tabFontSize = fontSize.code * 0.8;
  const tabHeight = tabFontSize * 2.2;
  const inner = cardPadding[preset];
  // The card fills the visual zone at most: inside the safe area, above the captions.
  const zone = visualZone(preset);
  const zoneWidth = width - zone.left - zone.right;
  const maxWidth = zoneWidth - 2 * inner;
  const maxHeight = height - zone.top - zone.bottom - tabHeight - 2 * inner;

  // With typing, highlights wait until the code is fully on screen.
  const highlightStart = scene.typing ? typingEndFrame(durationInFrames) : 0;
  const ranges = scene.highlight;
  const renderOverlay = ranges
    ? (layout: CodeLayout) => (
        <Sequence from={highlightStart} layout="none" name="LineHighlight">
          <LineHighlight
            ranges={ranges}
            layout={layout}
            durationInFrames={durationInFrames - highlightStart}
          />
        </Sequence>
      )
    : undefined;

  const blockProps = {
    code: scene.code,
    language: scene.language,
    preset,
    maxWidth,
    maxHeight,
    renderOverlay,
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: zone.left,
        paddingRight: zone.right,
        paddingTop: zone.top,
        paddingBottom: zone.bottom,
        // Every scene changes the same way; see SceneFrame.
        ...sceneTransitionStyle(frame, fps, durationInFrames),
      }}
    >
      <div
        style={{
          opacity: enter,
          transform: `translateY(${(1 - enter) * spacing.lg}px)`,
          backgroundColor: colors.surface,
          border: `2px solid ${colors.border}`,
          borderRadius: radius.lg,
          overflow: "hidden",
          maxWidth: zoneWidth,
          minWidth: preset === "short" ? zoneWidth : zoneWidth * 0.6,
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.45)",
        }}
      >
        <EditorBar filename={filename} height={tabHeight} fontSize={tabFontSize} inner={inner} />
        <div style={{ padding: inner, display: "flex" }}>
          {scene.typing ? (
            <TypingCode {...blockProps} durationInFrames={durationInFrames} />
          ) : (
            <CodeBlock {...blockProps} />
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const EditorBar: React.FC<{
  filename?: string;
  height: number;
  fontSize: number;
  inner: number;
}> = ({ filename, height, fontSize, inner }) => {
  const dot = Math.round(height * 0.22);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        height,
        paddingLeft: inner,
        gap: spacing.md,
        backgroundColor: colors.background,
        borderBottom: `2px solid ${colors.border}`,
      }}
    >
      <div style={{ display: "flex", gap: dot * 0.6, alignSelf: "center" }}>
        {[colors.danger, colors.warning, colors.success].map((c) => (
          <div
            key={c}
            style={{ width: dot, height: dot, borderRadius: dot, backgroundColor: c }}
          />
        ))}
      </div>
      {filename ? (
        <div
          style={{
            height: height * 0.78,
            lineHeight: `${height * 0.78}px`,
            padding: `0 ${spacing.md}px`,
            marginBottom: -2,
            backgroundColor: colors.surface,
            borderTop: `3px solid ${colors.accent}`,
            borderLeft: `2px solid ${colors.border}`,
            borderRight: `2px solid ${colors.border}`,
            borderTopLeftRadius: radius.sm,
            borderTopRightRadius: radius.sm,
            fontFamily: fonts.mono,
            fontSize,
            color: colors.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "70%",
          }}
        >
          {filename}
        </div>
      ) : null}
    </div>
  );
};
