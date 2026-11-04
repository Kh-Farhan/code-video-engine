import React, { useMemo } from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { activeChunkAt, activeWordIndexAt } from "../captions/active";
import { chunkWords } from "../captions/chunk";
import {
  BOX_LINE_HEIGHT,
  CAPTION_BOX_PADDING_Y,
  CAPTION_LINE_HEIGHT,
  CAPTION_MAX_LINES,
  captionBand,
  captionChunkOptions,
  captionFontSize,
  popCaptionLines,
  popWordOverflow,
  POP_FONT_SIZE,
  POP_LETTER_SPACING_EM,
  POP_MIN_FONT_SIZE,
  POP_WORD_GAP_EM,
  type Rect,
} from "../captions/layout";
import {
  activePageAt,
  activeTokenIndexAt,
  captionPages,
  captionsToWords,
  fitPageFontSize,
  type Caption as CaptionData,
} from "../captions/pages";
import type { CaptionStyleName } from "../schema/script";
import { colors, DEFAULT_CAPTION_STYLE, fonts, radius, spacing, type PresetName } from "../theme";

type CaptionProps = {
  /** One scene's words, ms relative to the enclosing Sequence. */
  captions: readonly CaptionData[];
  preset: PresetName;
  /** "pop" (big 1 to 3 word pages) or "box" (subtitle box). */
  variant?: CaptionStyleName;
};

/** Scale the active word settles at after its pop. */
const ACTIVE_SCALE = 1.1;
/** Springy enough to overshoot a little, so the word visibly pops. Peaks below POP_WORD_MAX_SCALE. */
const POP_SPRING = { damping: 11, stiffness: 260, mass: 0.6 } as const;

/** A heavy black outline made of shadows (renders the same in every browser), plus a soft drop. */
const outline = (px: number): string => {
  const steps = 16;
  const ring = Array.from({ length: steps }, (_, i) => {
    const a = (2 * Math.PI * i) / steps;
    return `${(Math.cos(a) * px).toFixed(1)}px ${(Math.sin(a) * px).toFixed(1)}px 0 #000`;
  });
  return [...ring, `0 ${px * 1.2}px ${px * 2.5}px rgba(0, 0, 0, 0.75)`].join(", ");
};

const bandStyle = (band: Rect): React.CSSProperties => ({
  position: "absolute",
  ...band,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

/**
 * Burned-in captions inside the caption band (see captions/layout.ts), so
 * they never cover the visual zone above.
 */
export const Caption: React.FC<CaptionProps> = ({
  captions,
  preset,
  variant = DEFAULT_CAPTION_STYLE,
}) => {
  const band = captionBand(preset);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {variant === "pop" ? (
        <PopCaption captions={captions} preset={preset} band={band} />
      ) : (
        <BoxCaption captions={captions} preset={preset} band={band} />
      )}
    </AbsoluteFill>
  );
};

/** TikTok-style pages of 1 to 3 words; the spoken word pops in the accent color. */
const PopCaption: React.FC<{ captions: readonly CaptionData[]; preset: PresetName; band: Rect }> = ({
  captions,
  preset,
  band,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pages = useMemo(() => captionPages(captions), [captions]);
  const ms = (frame * 1000) / fps;
  const page = activePageAt(pages, ms);
  if (!page) return null;

  const words = page.tokens.map((t) => t.text.trim());
  const fontSize = fitPageFontSize(words, {
    max: POP_FONT_SIZE[preset],
    min: POP_MIN_FONT_SIZE[preset],
    maxWidth: band.width,
    maxLines: CAPTION_MAX_LINES[preset],
  });
  const active = activeTokenIndexAt(page, ms);

  // Lines are broken up front with room for a fully popped word, and the
  // spoken word gets margins as wide as its overflow, so it pushes its
  // neighbors apart instead of covering them.
  const lines = popCaptionLines(words, fontSize, band.width);

  return (
    <div style={bandStyle(band)}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: band.width,
          fontFamily: fonts.sans,
          fontWeight: 800,
          fontSize,
          lineHeight: CAPTION_LINE_HEIGHT,
          letterSpacing: `${POP_LETTER_SPACING_EM}em`,
          textAlign: "center",
          color: "#ffffff",
          textShadow: outline(Math.max(4, fontSize * 0.09)),
        }}
      >
        {lines.map((line, l) => (
          <div
            key={l}
            style={{ display: "flex", flexWrap: "nowrap", columnGap: `${POP_WORD_GAP_EM}em` }}
          >
            {line.map((i) => {
              const token = page.tokens[i]!;
              const isActive = i === active;
              // Frames since this word started; drives a deterministic spring.
              const since = frame - Math.round((token.fromMs * fps) / 1000);
              const pop = isActive ? spring({ frame: since, fps, config: POP_SPRING }) : 0;
              const scale = 1 + (ACTIVE_SCALE - 1) * pop;
              const overflow = popWordOverflow(words[i]!, fontSize, scale);
              return (
                <span
                  key={`${page.startMs}-${i}`}
                  style={{
                    display: "inline-block",
                    whiteSpace: "nowrap",
                    color: isActive ? colors.captionHighlight : undefined,
                    transform: `scale(${scale.toFixed(4)})`,
                    marginLeft: overflow,
                    marginRight: overflow,
                  }}
                >
                  {words[i]}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Subtitle-style chunks of 3 to 6 words in a dark box. */
const BoxCaption: React.FC<{ captions: readonly CaptionData[]; preset: PresetName; band: Rect }> = ({
  captions,
  preset,
  band,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chunks = useMemo(
    () => chunkWords(captionsToWords(captions, fps), captionChunkOptions.box),
    [captions, fps],
  );
  const chunk = activeChunkAt(chunks, frame);
  if (!chunk) return null;
  const activeWord = activeWordIndexAt(chunk.words, frame);

  return (
    <div style={bandStyle(band)}>
      <div
        style={{
          maxWidth: band.width,
          padding: `${CAPTION_BOX_PADDING_Y}px ${spacing.md}px`,
          borderRadius: radius.md,
          backgroundColor: "rgba(0, 0, 0, 0.72)",
          fontFamily: fonts.sans,
          fontWeight: 800,
          fontSize: captionFontSize(preset, "box"),
          lineHeight: BOX_LINE_HEIGHT,
          textAlign: "center",
          color: "#ffffff",
          textShadow: "0 3px 8px rgba(0, 0, 0, 0.9)",
        }}
      >
        {chunk.words.map((word, i) => (
          <React.Fragment key={i}>
            {i > 0 ? " " : null}
            <span style={{ color: i === activeWord ? colors.warning : undefined }}>{word.text}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
