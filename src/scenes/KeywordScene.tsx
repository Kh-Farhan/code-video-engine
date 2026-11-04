import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { KeywordScene as KeywordSceneData } from "../schema/script";
import { colors, fonts, type PresetName } from "../theme";
import { enter } from "./animation";
import { SceneFrame, visualZoneSize } from "./SceneFrame";
import { beats, framesAt, videoProgress } from "./timing";
import type { SceneProps } from "./types";

/** Largest keyword size per preset, in px. */
const MAX_SIZE: Record<PresetName, number> = { short: 190, long: 210 };
/** Average glyph width of heavy Inter caps, as a fraction of the font size (a little generous). */
const GLYPH_EM = 0.7;
const LINE_HEIGHT = 1.02;

/** Font size that fits every word on its own line inside the zone. */
export const keywordFontSize = (keyword: string, preset: PresetName): number => {
  const zone = visualZoneSize(preset);
  const words = keyword.split(/\s+/).filter(Boolean);
  const longest = Math.max(1, ...words.map((w) => w.length));
  const byWidth = (zone.width * 0.92) / (longest * GLYPH_EM);
  const byHeight = (zone.height * 0.8) / (Math.max(1, words.length) * LINE_HEIGHT);
  return Math.floor(Math.min(MAX_SIZE[preset], byWidth, byHeight));
};

/**
 * One to three words, huge. Each word slams in from slightly larger and
 * blurred, an accent bar sweeps underneath, then the whole thing drifts
 * forward slowly so the frame never sits still.
 */
export const KeywordScene: React.FC<SceneProps<KeywordSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const size = keywordFontSize(scene.keyword, preset);
  const words = scene.keyword.split(/\s+/).filter(Boolean);
  const step = framesAt(fps, 0.18);
  const lastAt = (words.length - 1) * step;
  const barAt = lastAt + framesAt(fps, beats.secondary);
  const bar = interpolate(frame, [barAt, barAt + framesAt(fps, 0.35)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const drift = 1 + 0.05 * videoProgress(frame, durationInFrames);
  // A soft glow that breathes once over the scene.
  const glow = 0.35 + 0.25 * Math.sin(Math.PI * videoProgress(frame, durationInFrames));

  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames} align="center">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: `scale(${drift})`,
        }}
      >
        {words.map((word, i) => {
          const p = enter(frame, fps, i * step, true);
          const settle = enter(frame, fps, i * step);
          const blur = 12 * (1 - Math.min(1, settle));
          return (
            <div
              key={i}
              style={{
                fontFamily: fonts.sans,
                fontWeight: 900,
                fontSize: size,
                lineHeight: LINE_HEIGHT,
                letterSpacing: `${(0.02 + 0.1 * (1 - Math.min(1, settle))).toFixed(3)}em`,
                color: i === words.length - 1 ? colors.text : colors.accent,
                whiteSpace: "nowrap",
                opacity: Math.min(1, settle * 1.5),
                transform: `scale(${(1.5 - 0.5 * p).toFixed(4)})`,
                filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
                textShadow: `0 0 ${Math.round(size * 0.3)}px rgba(122, 162, 247, ${glow.toFixed(3)})`,
              }}
            >
              {word}
            </div>
          );
        })}
        <div
          style={{
            marginTop: Math.round(size * 0.18),
            height: Math.max(10, Math.round(size * 0.08)),
            width: Math.round(size * 2.4),
            borderRadius: 999,
            background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentAlt})`,
            transform: `scaleX(${bar})`,
          }}
        />
      </div>
    </SceneFrame>
  );
};
