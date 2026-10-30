import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { videoProgress } from "../scenes/timing";
import { colors } from "../theme";

/** Thin bar along the top edge showing how far into the video we are. */
export const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          height: 8,
          width: "100%",
          backgroundColor: "rgba(255, 255, 255, 0.08)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: "100%",
            background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentAlt})`,
            transform: `scaleX(${videoProgress(frame, durationInFrames)})`,
            transformOrigin: "left center",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
