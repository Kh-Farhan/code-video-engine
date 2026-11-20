import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { lookVisualZone } from "../components/looks/layout";
import { useVisualZone } from "../components/looks/LookContext";
import type { LookName } from "../schema/script";
import { DEFAULT_LOOK, presets, type PresetName } from "../theme";
import { sceneTransitionStyle } from "./animation";

/**
 * Bottom padding that keeps scene content inside the visual zone, clear of
 * the caption band (see captions/layout.ts).
 */
export const sceneBottomPadding = (preset: PresetName, look: LookName = DEFAULT_LOOK): number =>
  lookVisualZone(preset, look).bottom;

/** Inner size of the visual zone a SceneFrame lays its content out in, in px. */
export const visualZoneSize = (
  preset: PresetName,
  look: LookName = DEFAULT_LOOK,
): { width: number; height: number } => {
  const zone = lookVisualZone(preset, look);
  const { width, height } = presets[preset];
  return { width: width - zone.left - zone.right, height: height - zone.top - zone.bottom };
};

type SceneFrameProps = {
  preset: PresetName;
  durationInFrames: number;
  children: React.ReactNode;
  /** Main-axis alignment of the content column. */
  justify?: React.CSSProperties["justifyContent"];
  align?: React.CSSProperties["alignItems"];
  /** False: no zoom and blur in, the content is fully visible on the first frame. */
  transitionIn?: boolean;
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
  transitionIn = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zone = useVisualZone(preset);

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
          ...sceneTransitionStyle(frame, fps, durationInFrames, transitionIn),
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
