import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts, presets, spacing, type PresetName } from "../theme";

type BrandHandleProps = {
  handle: string;
  preset: PresetName;
};

/** Fades in after the hook so the first second belongs to the title. */
const SHOW_AFTER_SECONDS = 1;
const FADE_SECONDS = 0.4;

/**
 * Channel handle in a small pill. Top center in `short`, clear of the
 * corner buttons Shorts, Reels and Facebook draw; top right in `long`.
 */
export const BrandHandle: React.FC<BrandHandleProps> = ({ handle, preset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { height, fontSize } = presets[preset];
  const start = Math.round(fps * SHOW_AFTER_SECONDS);
  const opacity = interpolate(frame, [start, start + Math.round(fps * FADE_SECONDS)], [0, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const short = preset === "short";
  const size = Math.round(fontSize.caption * (short ? 0.8 : 0.7));

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        alignItems: short ? "center" : "flex-end",
        paddingTop: Math.round(height * (short ? 0.055 : 0.05)),
        paddingRight: short ? 0 : spacing.xl,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing.sm,
          padding: `${spacing.xs}px ${spacing.md}px`,
          borderRadius: 999,
          backgroundColor: "rgba(11, 15, 23, 0.55)",
          border: `2px solid rgba(122, 162, 247, 0.35)`,
          fontFamily: fonts.sans,
          fontWeight: 700,
          fontSize: size,
          color: colors.text,
          opacity,
        }}
      >
        <div
          style={{
            width: size * 0.45,
            height: size * 0.45,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentAlt})`,
          }}
        />
        {handle}
      </div>
    </AbsoluteFill>
  );
};
