import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { FlowScene as FlowSceneData } from "../schema/script";
import { colors, fonts, presets, radius, spacing, type PresetName } from "../theme";
import { enter } from "./animation";
import { SceneFrame, visualZoneSize } from "./SceneFrame";
import { beats, framesAt, listRevealFrames } from "./timing";
import type { SceneProps } from "./types";

/** Length of an arrow between boxes, in px. */
const ARROW: Record<PresetName, number> = { short: 96, long: 120 };

/**
 * 2 to 4 boxes joined by arrows. Each arrow draws toward the next box just
 * before it pops in; the newest box carries the accent. Left to right in
 * `long`, top to bottom in `short`.
 */
export const FlowScene: React.FC<SceneProps<FlowSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fontSize } = presets[preset];
  const zone = visualZoneSize(preset);
  const vertical = preset === "short";
  const n = scene.steps.length;
  const arrow = ARROW[preset];
  const boxWidth = vertical ? Math.min(zone.width, 760) : (zone.width - (n - 1) * arrow) / n;
  const reveals = listRevealFrames(n, durationInFrames, fps);
  const arrowFrames = framesAt(fps, 0.3);
  const dimFrames = framesAt(fps, beats.dim);

  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames} align="center">
      <div
        style={{
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          // Boxes in a row share one height; a column keeps each box's own.
          alignItems: vertical ? "center" : "stretch",
          justifyContent: "center",
          width: zone.width,
        }}
      >
        {scene.steps.map((step, i) => {
          const at = reveals[i] ?? 0;
          const pop = enter(frame, fps, at, true);
          const fade = enter(frame, fps, at);
          const next = reveals[i + 1];
          const active =
            next === undefined
              ? 1
              : interpolate(frame, [next, next + dimFrames], [1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
          const lit = frame >= at ? active : 0;
          // The arrow into box i draws during the frames just before it appears.
          const draw =
            i === 0
              ? 0
              : interpolate(frame, [at - arrowFrames, at], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.inOut(Easing.cubic),
                });
          return (
            <React.Fragment key={i}>
              {i > 0 ? <Arrow length={arrow} vertical={vertical} draw={draw} /> : null}
              <div
                style={{
                  width: boxWidth,
                  boxSizing: "border-box",
                  padding: `${spacing.md}px ${spacing.md}px`,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceRaised,
                  border: `3px solid ${lit > 0.01 ? colors.accent : colors.border}`,
                  boxShadow: `0 16px 48px rgba(0, 0, 0, 0.4), 0 0 ${Math.round(40 * lit)}px rgba(122, 162, 247, ${(0.45 * lit).toFixed(3)})`,
                  fontFamily: fonts.sans,
                  fontWeight: 700,
                  fontSize: fontSize.body,
                  lineHeight: 1.2,
                  color: colors.text,
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // Earlier boxes step back once the next one arrives.
                  opacity: Math.min(1, fade) * (0.75 + 0.25 * lit),
                  transform: `scale(${(0.7 + 0.3 * pop).toFixed(4)})`,
                }}
              >
                {step}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </SceneFrame>
  );
};

const Arrow: React.FC<{ length: number; vertical: boolean; draw: number }> = ({
  length,
  vertical,
  draw,
}) => {
  const thickness = 8;
  const head = 26;
  const shaft = Math.max(0, (length - spacing.md - head) * draw);
  return (
    <div
      style={{
        width: vertical ? head * 2 : length,
        height: vertical ? length : head * 2,
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: vertical ? thickness : shaft,
          height: vertical ? shaft : thickness,
          borderRadius: thickness,
          backgroundColor: colors.accent,
        }}
      />
      <svg
        width={head}
        height={head}
        viewBox="0 0 10 10"
        style={{ opacity: draw, transform: vertical ? "rotate(90deg)" : undefined, flexShrink: 0 }}
      >
        <polygon points="1,0 10,5 1,10" fill={colors.accent} />
      </svg>
    </div>
  );
};
