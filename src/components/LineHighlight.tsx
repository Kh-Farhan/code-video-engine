import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { LineRange } from "../schema/script";
import { colors, spacing } from "../theme";
import { lineRangesToRows, type CodeLayout } from "./codeLayout";
import { HIGHLIGHT_TRANSITION_SECONDS, highlightFocus } from "./timing";

export type LineHighlightProps = {
  /** 1-based inclusive source line ranges, shown in order. */
  ranges: readonly LineRange[];
  layout: CodeLayout;
  /** Frames to spread the steps across, starting at this component's frame 0. */
  durationInFrames: number;
  /** Color the dimmed lines fade toward: the surface the code sits on. */
  surfaceColor?: string;
};

/** "#rrggbb" to "rgba(r, g, b, alpha)". */
const withAlpha = (hex: string, alpha: number): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * Overlay for CodeBlock: a focus band behind the active lines and two masks
 * that dim everything above and below it. The band glides between steps.
 */
export const LineHighlight: React.FC<LineHighlightProps> = ({
  ranges,
  layout,
  durationInFrames,
  surfaceColor = colors.surface,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rowRanges = lineRangesToRows(ranges, layout);
  const { top, bottom, strength } = highlightFocus(
    frame,
    durationInFrames,
    rowRanges,
    layout.totalRows,
    Math.round(fps * HIGHLIGHT_TRANSITION_SECONDS),
  );

  const lh = layout.lineHeight;
  const bleed = spacing.sm;
  const mask = withAlpha(surfaceColor, (1 - colors.dimOpacity) * strength);
  const maskStyle: React.CSSProperties = {
    position: "absolute",
    left: -bleed,
    right: -bleed,
    backgroundColor: mask,
    zIndex: 2,
  };

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: top * lh,
          height: (bottom - top) * lh,
          left: -bleed,
          right: -bleed,
          backgroundColor: colors.highlight,
          borderLeft: `${Math.max(3, Math.round(lh * 0.06))}px solid ${colors.accent}`,
          borderRadius: 6,
          opacity: strength,
          zIndex: 0,
        }}
      />
      <div style={{ ...maskStyle, top: 0, height: top * lh }} />
      <div style={{ ...maskStyle, top: bottom * lh, bottom: 0 }} />
    </>
  );
};
