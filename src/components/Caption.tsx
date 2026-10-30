import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { activeChunkAt, activeWordIndexAt } from "../captions/active";
import { captionLayout } from "../captions/layout";
import type { CaptionChunk } from "../captions/types";
import { colors, fonts, presets, radius, spacing, type PresetName } from "../theme";

type CaptionProps = {
  /** Chunks with frames relative to the enclosing Sequence. */
  chunks: readonly CaptionChunk[];
  preset: PresetName;
  /** Color the word being spoken. Defaults to true. */
  emphasizeActiveWord?: boolean;
};

const POP_IN_FRAMES = 4;

/** Shows the chunk being spoken, bold and high contrast, with the active word emphasized. */
export const Caption: React.FC<CaptionProps> = ({
  chunks,
  preset,
  emphasizeActiveWord = true,
}) => {
  const frame = useCurrentFrame();
  const chunk = activeChunkAt(chunks, frame);
  if (!chunk) return null;

  const { width, height, fontSize } = presets[preset];
  const { centerY, maxWidth } = captionLayout[preset];
  const activeWord = emphasizeActiveWord ? activeWordIndexAt(chunk.words, frame) : -1;
  const local = frame - chunk.startFrame;
  const scale = interpolate(local, [0, POP_IN_FRAMES], [0.92, 1], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(local, [0, POP_IN_FRAMES], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: centerY * height,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(-50%) scale(${scale})`,
          opacity,
        }}
      >
        <div
          style={{
            maxWidth: maxWidth * width,
            padding: `${spacing.sm}px ${spacing.md}px`,
            borderRadius: radius.md,
            backgroundColor: "rgba(0, 0, 0, 0.72)",
            fontFamily: fonts.sans,
            fontWeight: 800,
            fontSize: fontSize.caption,
            lineHeight: 1.2,
            textAlign: "center",
            color: "#ffffff",
            textShadow: "0 3px 8px rgba(0, 0, 0, 0.9)",
          }}
        >
          {chunk.words.map((word, i) => (
            <React.Fragment key={i}>
              {i > 0 ? " " : null}
              <span style={{ color: i === activeWord ? colors.warning : undefined }}>
                {word.text}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
