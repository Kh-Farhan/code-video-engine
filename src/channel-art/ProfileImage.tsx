import React from "react";
import { AbsoluteFill } from "remotion";
import { colors, fonts } from "../theme";
import { profileLayout, type ProfileMark } from "./layout";

export type ChannelProfileProps = {
  mark?: ProfileMark;
  /** Draws the circle YouTube crops to, for checking the layout in Studio. */
  debugCircle?: boolean;
};

/**
 * 800x800 channel profile image. One bold mark on the dark theme, high
 * contrast and large so it still reads at 98x98 after the circle crop.
 */
export const ChannelProfile: React.FC<ChannelProfileProps> = ({ mark = "FG", debugCircle = false }) => {
  const fontSize = profileLayout.fontSize[mark];
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.background,
        backgroundImage: `radial-gradient(circle at 30% 20%, ${colors.surfaceRaised} 0%, ${colors.background} 70%)`,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Accent ring just inside the circle crop. */}
      <div
        style={{
          position: "absolute",
          inset: "6%",
          boxSizing: "border-box",
          borderRadius: "50%",
          border: `18px solid ${colors.accent}`,
          opacity: 0.9,
        }}
      />
      <div
        style={{
          fontFamily: fonts.sans,
          fontWeight: 800,
          fontSize,
          // Optical centering: Inter caps sit slightly high in their line box.
          lineHeight: 1,
          marginTop: Math.round(fontSize * 0.04),
          letterSpacing: `${profileLayout.letterSpacingEm}em`,
          color: colors.text,
          whiteSpace: "nowrap",
          textShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
        }}
      >
        {mark === "FG" ? (
          <>
            F<span style={{ color: colors.captionHighlight }}>G</span>
          </>
        ) : (
          <>
            {"<"}
            <span style={{ color: colors.captionHighlight }}>/</span>
            {">"}
          </>
        )}
      </div>
      {debugCircle ? (
        <AbsoluteFill style={{ borderRadius: "50%", outline: `4px dashed ${colors.danger}`, outlineOffset: -4 }} />
      ) : null}
    </AbsoluteFill>
  );
};
