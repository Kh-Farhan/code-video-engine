import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { TitleScene as TitleSceneData } from "../schema/script";
import { colors, fonts, presets, spacing } from "../theme";
import { enter, riseIn, staggeredWords } from "./animation";
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
  const heading = staggeredWords(scene.heading, frame, fps, framesAt(fps, beats.heading), 60);
  const subheading = enter(frame, fps, heading.lastStart + framesAt(fps, beats.secondary));

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
        }}
      >
        {heading.words.map(({ word, style }, i) => (
          <React.Fragment key={i}>
            {i > 0 ? " " : null}
            <span style={style}>{word}</span>
          </React.Fragment>
        ))}
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
