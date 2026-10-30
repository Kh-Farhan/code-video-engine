import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, presets, type PresetName } from "../theme";
import { fadeOutAtEnd } from "./animation";

type SceneFrameProps = {
  preset: PresetName;
  durationInFrames: number;
  children: React.ReactNode;
  /** Main-axis alignment of the content column. */
  justify?: React.CSSProperties["justifyContent"];
  align?: React.CSSProperties["alignItems"];
};

/** Shared scene shell: background, preset padding, and a short fade at the end. */
export const SceneFrame: React.FC<SceneFrameProps> = ({
  preset,
  durationInFrames,
  children,
  justify = "center",
  align = "flex-start",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { padding } = presets[preset];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.background,
        backgroundImage: `radial-gradient(circle at 15% 10%, ${colors.surfaceRaised} 0%, ${colors.background} 55%)`,
      }}
    >
      <AbsoluteFill
        style={{
          padding,
          flexDirection: "column",
          justifyContent: justify,
          alignItems: align,
          opacity: fadeOutAtEnd(frame, fps, durationInFrames),
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
