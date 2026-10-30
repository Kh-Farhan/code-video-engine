import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { TextScene as TextSceneData } from "../schema/script";
import { colors, fonts, presets, spacing } from "../theme";
import { enter, riseIn } from "./animation";
import { SceneFrame } from "./SceneFrame";
import { framesAt } from "./timing";
import type { SceneProps } from "./types";

/** One or two sentences, large, with an accent rule that grows beside them. */
export const TextScene: React.FC<SceneProps<TextSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fontSize } = presets[preset];

  const rule = enter(frame, fps, 0, true);
  const text = enter(frame, fps, framesAt(fps, 0.1));
  // Between body and heading so it reads as the focus of the scene.
  const size = Math.round((fontSize.body + fontSize.heading) / 2);

  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames}>
      <div style={{ display: "flex", alignItems: "stretch", gap: spacing.lg }}>
        <div
          style={{
            width: 10,
            flexShrink: 0,
            borderRadius: 5,
            backgroundColor: colors.accent,
            transform: `scaleY(${rule})`,
            transformOrigin: "top center",
          }}
        />
        <p
          style={{
            margin: 0,
            fontFamily: fonts.sans,
            fontWeight: 600,
            fontSize: size,
            lineHeight: 1.25,
            color: colors.text,
            maxWidth: preset === "short" ? "100%" : 1400,
            ...riseIn(text),
          }}
        >
          {scene.text}
        </p>
      </div>
    </SceneFrame>
  );
};
