import React from "react";
import { AbsoluteFill } from "remotion";
import { brand, fonts, type PresetName } from "../../theme";
import { wordmarkBox } from "./layout";

/** Low enough to stay out of the way, high enough to read as the channel. */
export const WORDMARK_OPACITY = 0.55;

/**
 * The channel mark in the top-left corner, in every look: an "FG" tile,
 * plus the channel name in `long` where there is room. Static, so the hook
 * on frame 0 is not competing with motion.
 */
export const Wordmark: React.FC<{ preset: PresetName }> = ({ preset }) => {
  const box = wordmarkBox(preset);
  const size = box.height;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          height: size,
          display: "flex",
          alignItems: "center",
          gap: Math.round(size * 0.3),
          opacity: WORDMARK_OPACITY,
        }}
      >
        <div
          style={{
            width: box.width,
            height: size,
            boxSizing: "border-box",
            borderRadius: Math.round(size * 0.26),
            border: `${Math.max(2, Math.round(size * 0.06))}px solid ${brand.accent}`,
            backgroundColor: "rgba(11, 15, 23, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: fonts.mono,
            fontWeight: 800,
            fontSize: Math.round(size * 0.44),
            letterSpacing: "-0.04em",
            color: brand.accent,
          }}
        >
          {brand.mark}
        </div>
        {preset === "long" ? (
          <div
            style={{
              fontFamily: fonts.sans,
              fontWeight: 800,
              fontSize: Math.round(size * 0.48),
              color: "#ffffff",
              whiteSpace: "nowrap",
              textShadow: "0 2px 8px rgba(0, 0, 0, 0.5)",
            }}
          >
            {brand.name}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
