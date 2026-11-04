import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { captionSafeBottom } from "../captions/layout";
import { presets, visualZoneBottomPx, type PresetName } from "../theme";
import { sceneTransitionStyle } from "./animation";

/**
 * Bottom padding that keeps scene content inside the visual zone: clear of
 * the caption band and of the theme's visual zone line, whichever is higher.
 */
export const sceneBottomPadding = (preset: PresetName): number => {
  const { height, padding } = presets[preset];
  return Math.max(padding, captionSafeBottom(preset), height - visualZoneBottomPx(preset));
};

/** Inner size of the visual zone a SceneFrame lays its content out in, in px. */
export const visualZoneSize = (preset: PresetName): { width: number; height: number } => {
  const { width, height, padding } = presets[preset];
  return { width: width - 2 * padding, height: height - padding - sceneBottomPadding(preset) };
};

type SceneFrameProps = {
  preset: PresetName;
  durationInFrames: number;
  children: React.ReactNode;
  /** Main-axis alignment of the content column. */
  justify?: React.CSSProperties["justifyContent"];
  align?: React.CSSProperties["alignItems"];
};

/**
 * Shared scene shell: preset padding and the scene change transition. The
 * background is drawn once for the whole video by Backdrop, so scenes are
 * transparent.
 * Content is laid out in the visual zone above the caption band, so
 * captions never cover it.
 */
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
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          padding,
          paddingBottom: sceneBottomPadding(preset),
          flexDirection: "column",
          justifyContent: justify,
          alignItems: align,
          ...sceneTransitionStyle(frame, fps, durationInFrames),
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
