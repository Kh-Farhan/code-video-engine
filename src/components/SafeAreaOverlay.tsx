import React from "react";
import { AbsoluteFill } from "remotion";
import { captionBand, visualZoneRect, type Rect } from "../captions/layout";
import { fonts, platformSafeArea, presets, type PresetName } from "../theme";

type SafeAreaOverlayProps = { preset: PresetName };

const UNSAFE = "rgba(247, 118, 142, 0.28)";
const UNSAFE_EDGE = "rgba(247, 118, 142, 0.9)";

const Label: React.FC<{ children: React.ReactNode; color: string; size: number }> = ({
  children,
  color,
  size,
}) => (
  <div
    style={{
      position: "absolute",
      top: 6,
      left: 10,
      fontFamily: fonts.mono,
      fontWeight: 700,
      fontSize: size,
      color,
      textShadow: "0 1px 3px #000",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);

const Zone: React.FC<{ rect: Rect; color: string; label: string; size: number }> = ({
  rect,
  color,
  label,
  size,
}) => (
  <div
    style={{
      position: "absolute",
      ...rect,
      boxSizing: "border-box",
      border: `4px dashed ${color}`,
    }}
  >
    <Label color={color} size={size}>
      {label}
    </Label>
  </div>
);

/**
 * Debug overlay: shades the platform UI areas (outside the safe area) in red,
 * outlines the visual zone in blue and the caption band in yellow. Turn it on
 * with the `debugSafeArea` prop in Studio. Never part of a real render.
 */
export const SafeAreaOverlay: React.FC<SafeAreaOverlayProps> = ({ preset }) => {
  const { width, height } = presets[preset];
  const safe = platformSafeArea[preset];
  const size = preset === "short" ? 26 : 20;
  const strips: { rect: Rect; label: string }[] = [
    { rect: { top: 0, left: 0, width, height: safe.top }, label: `top ${safe.top}px` },
    {
      rect: { top: height - safe.bottom, left: 0, width, height: safe.bottom },
      label: `bottom ${safe.bottom}px: description UI`,
    },
    {
      rect: { top: safe.top, left: width - safe.right, width: safe.right, height: height - safe.top - safe.bottom },
      label: `right ${safe.right}px`,
    },
    {
      rect: { top: safe.top, left: 0, width: safe.left, height: height - safe.top - safe.bottom },
      label: "",
    },
  ];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {strips
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
        .map(({ rect, label }, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              ...rect,
              backgroundColor: UNSAFE,
              outline: `2px solid ${UNSAFE_EDGE}`,
              overflow: "hidden",
            }}
          >
            {label && rect.width > size * 8 ? (
              <Label color="#fff" size={size}>
                {label}
              </Label>
            ) : null}
          </div>
        ))}
      <Zone rect={visualZoneRect(preset)} color="#7aa2f7" label="visual zone" size={size} />
      <Zone rect={captionBand(preset)} color="#ffd43b" label="caption band" size={size} />
    </AbsoluteFill>
  );
};
