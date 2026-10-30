import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneType } from "../schema/script";
import { colors, fonts, presets, type PresetName } from "../theme";

type PlaceholderSceneProps = {
  type: SceneType;
  preset: PresetName;
};

/** Temporary stand-in for real scene components: shows the scene type name. */
export const PlaceholderScene: React.FC<PlaceholderSceneProps> = ({
  type,
  preset,
}) => {
  const frame = useCurrentFrame();
  const { fontSize, padding } = presets[preset];
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.background,
        justifyContent: "center",
        alignItems: "center",
        padding,
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: fontSize.body,
          color: colors.textMuted,
        }}
      >
        scene
      </div>
      <div
        style={{
          fontFamily: fonts.sans,
          fontWeight: 800,
          fontSize: fontSize.heading,
          color: colors.accent,
        }}
      >
        {type}
      </div>
    </AbsoluteFill>
  );
};
