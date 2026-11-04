import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { activeChunkAt, activeWordIndexAt } from "../captions/active";
import {
  CAPTION_BOX_PADDING_Y,
  CAPTION_LINE_HEIGHT,
  captionFontSize,
  captionLayout,
  popCaptionLines,
  popWordOverflow,
  POP_LETTER_SPACING_EM,
  POP_WORD_GAP_EM,
  POP_WORD_MAX_SCALE,
} from "../captions/layout";
import type { CaptionChunk } from "../captions/types";
import type { CaptionStyleName } from "../schema/script";
import { colors, DEFAULT_CAPTION_STYLE, fonts, presets, radius, spacing, type PresetName } from "../theme";

type CaptionProps = {
  /** Chunks with frames relative to the enclosing Sequence. */
  chunks: readonly CaptionChunk[];
  preset: PresetName;
  /** "pop" (big outlined words) or "box" (subtitle box). */
  variant?: CaptionStyleName;
  /** Color the word being spoken. Defaults to true. */
  emphasizeActiveWord?: boolean;
};

const POP_IN_SECONDS = 0.13;
/** How long the spoken word takes to pop up to its emphasized size. */
const WORD_POP_SECONDS = 0.1;

/** An outline made of shadows, which renders the same in every browser, plus a soft drop. */
const outline = (px: number): string => {
  const steps = 16;
  const ring = Array.from({ length: steps }, (_, i) => {
    const a = (2 * Math.PI * i) / steps;
    return `${(Math.cos(a) * px).toFixed(1)}px ${(Math.sin(a) * px).toFixed(1)}px 0 #000`;
  });
  return [...ring, `0 ${px * 1.5}px ${px * 2.5}px rgba(0, 0, 0, 0.6)`].join(", ");
};

/** Shows the chunk being spoken, with the spoken word emphasized. */
export const Caption: React.FC<CaptionProps> = ({
  chunks,
  preset,
  variant = DEFAULT_CAPTION_STYLE,
  emphasizeActiveWord = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chunk = activeChunkAt(chunks, frame);
  if (!chunk) return null;

  const { width, height } = presets[preset];
  const { centerY, maxWidth } = captionLayout[preset];
  const fontSize = captionFontSize(preset, variant);
  const activeWord = emphasizeActiveWord ? activeWordIndexAt(chunk.words, frame) : -1;
  const local = frame - chunk.startFrame;
  const popIn = Math.max(1, Math.round(fps * POP_IN_SECONDS));
  const pop = variant === "pop";
  const scale = interpolate(local, [0, popIn], [pop ? 0.8 : 0.92, 1], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(local, [0, popIn], [0, 1], { extrapolateRight: "clamp" });
  const wordPop = Math.max(1, Math.round(fps * WORD_POP_SECONDS));

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
            fontFamily: fonts.sans,
            fontWeight: 800,
            fontSize,
            lineHeight: CAPTION_LINE_HEIGHT,
            textAlign: "center",
            color: "#ffffff",
            ...(pop
              ? {
                  letterSpacing: `${POP_LETTER_SPACING_EM}em`,
                  textShadow: outline(Math.max(3, fontSize * 0.075)),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }
              : {
                  padding: `${CAPTION_BOX_PADDING_Y}px ${spacing.md}px`,
                  borderRadius: radius.md,
                  backgroundColor: "rgba(0, 0, 0, 0.72)",
                  textShadow: "0 3px 8px rgba(0, 0, 0, 0.9)",
                }),
          }}
        >
          {pop
            ? // Lines are broken up front with room for a fully popped word, and
              // the spoken word gets margins as wide as its overflow, so it
              // pushes its neighbors apart instead of covering them.
              popCaptionLines(
                chunk.words.map((w) => w.text),
                fontSize,
                maxWidth * width,
              ).map((line, l) => (
                <div
                  key={l}
                  style={{ display: "flex", flexWrap: "nowrap", columnGap: `${POP_WORD_GAP_EM}em` }}
                >
                  {line.map((i) => {
                    const word = chunk.words[i]!;
                    const active = i === activeWord;
                    const wordScale = active
                      ? interpolate(
                          frame - word.startFrame,
                          [0, wordPop, wordPop * 2],
                          [1, POP_WORD_MAX_SCALE, 1.1],
                          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                        )
                      : 1;
                    const overflow = popWordOverflow(word.text, fontSize, wordScale);
                    return (
                      <span
                        key={i}
                        style={{
                          display: "inline-block",
                          whiteSpace: "nowrap",
                          color: active ? colors.captionHighlight : undefined,
                          transform: `scale(${wordScale})`,
                          marginLeft: overflow,
                          marginRight: overflow,
                        }}
                      >
                        {word.text}
                      </span>
                    );
                  })}
                </div>
              ))
            : chunk.words.map((word, i) => (
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
