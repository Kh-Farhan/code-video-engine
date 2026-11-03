import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { OutroScene as OutroSceneData } from "../schema/script";
import { colors, fonts, presets, radius, spacing } from "../theme";
import { enter, riseIn, staggeredWords } from "./animation";
import { SceneFrame } from "./SceneFrame";
import { beats, framesAt } from "./timing";
import type { SceneProps } from "./types";

/** How long the light sweep takes to cross the card, and how often it repeats. */
const SWEEP_SECONDS = 0.9;
const SWEEP_EVERY_SECONDS = 3;

/**
 * Call to action in an accent card that scales in, words rising one by one,
 * with a light sweep across the card and the channel handle underneath.
 */
export const OutroScene: React.FC<SceneProps<OutroSceneData>> = ({
  scene,
  preset,
  durationInFrames,
  handle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fontSize } = presets[preset];

  const card = enter(frame, fps, 0, true);
  const glow = enter(frame, fps, framesAt(fps, beats.secondary));
  const cta = staggeredWords(scene.cta, frame, fps, framesAt(fps, beats.follow));
  const follow = enter(frame, fps, cta.lastStart + framesAt(fps, beats.secondary));
  // The sweep starts once the card has settled, then repeats.
  const sweepStart = framesAt(fps, 0.6);
  const cycle = framesAt(fps, SWEEP_EVERY_SECONDS);
  const sweepT = frame < sweepStart ? -1 : ((frame - sweepStart) % cycle) / framesAt(fps, SWEEP_SECONDS);
  const sweepX = interpolate(sweepT, [0, 1], [-60, 160], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames} align="center">
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          padding: `${spacing.xl}px ${spacing.xl}px`,
          borderRadius: radius.lg,
          backgroundColor: "rgba(18, 24, 38, 0.85)",
          border: `4px solid ${colors.accent}`,
          boxShadow: `0 0 ${Math.round(140 * glow)}px rgba(122, 162, 247, ${0.45 * glow})`,
          textAlign: "center",
          maxWidth: "100%",
          opacity: interpolate(card, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
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
          {cta.words.map(({ word, style }, i) => (
            <React.Fragment key={i}>
              {i > 0 ? " " : null}
              <span style={style}>{word}</span>
            </React.Fragment>
          ))}
        </div>
        {sweepT >= 0 && sweepT <= 1 ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${sweepX}%`,
              width: "30%",
              background: "linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.16), transparent)",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
      {handle ? (
        <div
          style={{
            marginTop: spacing.lg,
            fontFamily: fonts.sans,
            fontWeight: 600,
            fontSize: fontSize.body,
            color: colors.textMuted,
            ...riseIn(follow),
          }}
        >
          Follow <span style={{ color: colors.accent, fontWeight: 800 }}>{handle}</span>
        </div>
      ) : null}
    </SceneFrame>
  );
};
