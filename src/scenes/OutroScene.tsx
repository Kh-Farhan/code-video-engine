import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { OutroScene as OutroSceneData } from "../schema/script";
import { colors, fonts, presets, radius, spacing } from "../theme";
import { enter } from "./animation";
import { SceneFrame } from "./SceneFrame";
import { framesAt } from "./timing";
import type { SceneProps } from "./types";

/** Call to action in an accent card that scales in, centered. */
export const OutroScene: React.FC<SceneProps<OutroSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fontSize } = presets[preset];

  const card = enter(frame, fps, 0, true);
  const glow = enter(frame, fps, framesAt(fps, 0.3));

  return (
    <SceneFrame
      preset={preset}
      durationInFrames={durationInFrames}
      align="center"
    >
      <div
        style={{
          padding: `${spacing.xl}px ${spacing.xl}px`,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
          border: `4px solid ${colors.accent}`,
          boxShadow: `0 0 ${Math.round(120 * glow)}px rgba(122, 162, 247, ${0.35 * glow})`,
          textAlign: "center",
          maxWidth: "100%",
          opacity: interpolate(card, [0, 0.4], [0, 1], {
            extrapolateRight: "clamp",
          }),
          transform: `scale(${interpolate(card, [0, 1], [0.85, 1])})`,
        }}
      >
        <div
          style={{
            fontFamily: fonts.sans,
            fontWeight: 800,
            fontSize: fontSize.heading,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: colors.text,
          }}
        >
          {scene.cta}
        </div>
      </div>
    </SceneFrame>
  );
};
