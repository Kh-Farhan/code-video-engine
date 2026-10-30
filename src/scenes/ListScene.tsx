import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ListScene as ListSceneData } from "../schema/script";
import { colors, fonts, presets, radius, spacing } from "../theme";
import { enter, riseIn } from "./animation";
import { SceneFrame } from "./SceneFrame";
import { listRevealFrames } from "./timing";
import type { SceneProps } from "./types";

/** Numbered items revealed one at a time, spread across the scene. */
export const ListScene: React.FC<SceneProps<ListSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fontSize } = presets[preset];
  const reveals = listRevealFrames(scene.items.length, durationInFrames, fps);
  const badge = Math.round(fontSize.body * 1.5);

  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: preset === "short" ? spacing.xl : spacing.lg,
          width: "100%",
        }}
      >
        {scene.items.map((item, i) => {
          const at = reveals[i] ?? 0;
          const progress = enter(frame, fps, at);
          const pop = enter(frame, fps, at, true);
          // The newest item stays bright; earlier ones step back a little.
          const next = reveals[i + 1];
          const focus =
            next === undefined
              ? 1
              : interpolate(frame, [next, next + 10], [1, 0.55], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.md,
                ...riseIn(progress),
                opacity: Math.min(1, progress) * focus,
              }}
            >
              <div
                style={{
                  width: badge,
                  height: badge,
                  flexShrink: 0,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceRaised,
                  border: `3px solid ${colors.accent}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: fonts.mono,
                  fontWeight: 700,
                  fontSize: fontSize.body,
                  color: colors.accent,
                  transform: `scale(${pop})`,
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontWeight: 600,
                  fontSize: fontSize.body,
                  lineHeight: 1.25,
                  color: colors.text,
                }}
              >
                {item}
              </div>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};
