import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { TitleScene as TitleSceneData } from "../schema/script";
import { colors, fonts, presets, spacing } from "../theme";
import { enter, riseIn } from "./animation";
import { SceneFrame } from "./SceneFrame";
import { beats, framesAt } from "./timing";
import type { SceneProps } from "./types";

/** Big heading with an accent bar; the subheading follows a beat later. */
export const TitleScene: React.FC<SceneProps<TitleSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fontSize } = presets[preset];

  const bar = enter(frame, fps, 0, true);
  const heading = enter(frame, fps, framesAt(fps, beats.heading));
  const subheading = enter(frame, fps, framesAt(fps, beats.secondary));

  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames}>
      <div
        style={{
          width: preset === "short" ? 160 : 200,
          height: 12,
          borderRadius: 6,
          marginBottom: spacing.lg,
          background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentAlt})`,
          transform: `scaleX(${bar})`,
          transformOrigin: "left center",
        }}
      />
      <h1
        style={{
          margin: 0,
          fontFamily: fonts.sans,
          fontWeight: 800,
          fontSize: fontSize.heading,
          lineHeight: 1.08,
          letterSpacing: "-0.02em",
          color: colors.text,
          maxWidth: preset === "short" ? "100%" : "85%",
          ...riseIn(heading, 60),
        }}
      >
        {scene.heading}
      </h1>
      {scene.subheading ? (
        <p
          style={{
            margin: 0,
            marginTop: spacing.lg,
            fontFamily: fonts.sans,
            fontWeight: 400,
            fontSize: fontSize.subheading,
            lineHeight: 1.3,
            color: colors.textMuted,
            maxWidth: preset === "short" ? "100%" : "75%",
            ...riseIn(subheading),
          }}
        >
          {scene.subheading}
        </p>
      ) : null}
    </SceneFrame>
  );
};
