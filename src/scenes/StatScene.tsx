import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { StatScene as StatSceneData } from "../schema/script";
import { colors, fonts, presets, type PresetName } from "../theme";
import { enter, riseIn } from "./animation";
import { SceneFrame, visualZoneSize } from "./SceneFrame";
import { beats, framesAt, statRevealFrames } from "./timing";
import type { SceneProps } from "./types";

const MAX_SIZE: Record<PresetName, number> = { short: 300, long: 280 };
const GLYPH_EM = 0.66;

/** Font size for the big value so it fits the zone width. */
export const statFontSize = (value: string, preset: PresetName): number => {
  const zone = visualZoneSize(preset);
  return Math.floor(
    Math.min(MAX_SIZE[preset], (zone.width * 0.9) / (Math.max(1, value.length) * GLYPH_EM), zone.height * 0.45),
  );
};

/**
 * One big value with a small label underneath. With `from`, the old value
 * shows first, then gets struck through and lifts away as the new one pops in.
 */
export const StatScene: React.FC<SceneProps<StatSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fontSize } = presets[preset];
  const size = statFontSize(scene.value, preset);
  const at = statRevealFrames(durationInFrames, fps, scene.from !== undefined);
  const value = enter(frame, fps, at.value, true);
  const valueFade = enter(frame, fps, at.value);
  const label = riseIn(enter(frame, fps, at.value + framesAt(fps, beats.secondary)));
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

  const fromIn = enter(frame, fps, at.from);
  // The old value is struck just before the new one lands, then shrinks upward.
  const strikeAt = at.value - framesAt(fps, 0.3);
  const strike = interpolate(frame, [strikeAt, strikeAt + framesAt(fps, 0.25)], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const away = interpolate(frame, [at.value, at.value + framesAt(fps, 0.4)], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const fromSize = scene.from ? statFontSize(scene.from, preset) : 0;
  const fromScale = 1 - 0.6 * away;

  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames} align="center">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {scene.from ? (
          <div
            style={{
              position: "relative",
              height: fromSize * (1 - 0.6 * away) * 1.05,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: Math.min(1, fromIn) * (1 - 0.35 * away),
            }}
          >
            <div
              style={{
                position: "relative",
                fontFamily: fonts.sans,
                fontWeight: 900,
                fontSize: fromSize,
                lineHeight: 1,
                color: away > 0 ? colors.textMuted : colors.text,
                transform: `scale(${fromScale.toFixed(4)})`,
                whiteSpace: "nowrap",
              }}
            >
              {scene.from}
              <div
                style={{
                  position: "absolute",
                  left: "-6%",
                  right: "-6%",
                  top: "50%",
                  height: Math.max(8, Math.round(fromSize * 0.07)),
                  borderRadius: 999,
                  backgroundColor: colors.danger,
                  transform: `scaleX(${strike}) rotate(-8deg)`,
                  transformOrigin: "left center",
                }}
              />
            </div>
          </div>
        ) : null}
        <div
          style={{
            height: (scene.from ? valueFade : 1) * size * 1.05,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: fonts.sans,
              fontWeight: 900,
              fontSize: size,
              lineHeight: 1,
              color: scene.from ? colors.success : colors.accent,
              whiteSpace: "nowrap",
              opacity: Math.min(1, valueFade * 1.5),
              transform: `scale(${(0.4 + 0.6 * value).toFixed(4)})`,
              textShadow: `0 0 ${Math.round(size * 0.25)}px ${scene.from ? "rgba(158, 206, 106, 0.4)" : "rgba(122, 162, 247, 0.4)"}`,
            }}
          >
            {scene.value}
          </div>
        </div>
        <div
          style={{
            marginTop: Math.round(fontSize.body * 0.5),
            fontFamily: fonts.sans,
            fontWeight: 600,
            fontSize: fontSize.body,
            color: colors.textMuted,
            textAlign: "center",
            ...label,
          }}
        >
          {scene.label}
        </div>
      </div>
    </SceneFrame>
  );
};
