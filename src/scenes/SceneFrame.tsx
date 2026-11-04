import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { visualZone } from "../captions/layout";
import type { PresetName } from "../theme";
import { sceneTransitionStyle } from "./animation";

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
 * Content stays in the visual zone: inside the platform safe area and above
 * the caption band, so captions never cover it.
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
  const zone = visualZone(preset);

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          paddingTop: zone.top,
          paddingRight: zone.right,
          paddingBottom: zone.bottom,
          paddingLeft: zone.left,
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
