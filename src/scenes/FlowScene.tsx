import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { FlowScene as FlowSceneData } from "../schema/script";
import { colors, fonts, presets, radius, spacing, type PresetName } from "../theme";
import { enter } from "./animation";
import { SceneFrame, visualZoneSize } from "./SceneFrame";
import { beats, framesAt, listRevealFrames } from "./timing";
import type { SceneProps } from "./types";

/** Length of an arrow between boxes, in px. */
const ARROW: Record<PresetName, number> = { short: 96, long: 120 };
const BOX_PAD = spacing.md;
const BORDER = 3;
const LINE_HEIGHT = 1.2;
/** Average glyph width of bold Inter, as a fraction of the font size (a little generous). */
const GLYPH_EM = 0.56;

/**
 * Size of every box: one shared size so the chain can be centred exactly.
 * Rows of text are estimated from character counts, which is plenty for
 * labels of 24 characters at most.
 */
export const flowBoxSize = (
  steps: readonly string[],
  preset: PresetName,
): { width: number; height: number } => {
  const { fontSize } = presets[preset];
  const zone = visualZoneSize(preset);
  const n = steps.length;
  const width =
    preset === "short" ? Math.min(zone.width, 760) : (zone.width - (n - 1) * ARROW[preset]) / n;
  const perRow = Math.max(1, Math.floor((width - 2 * (BOX_PAD + BORDER)) / (fontSize.body * GLYPH_EM)));
  const rows = Math.max(1, ...steps.map((s) => wrappedRows(s, perRow)));
  return { width, height: Math.ceil(rows * fontSize.body * LINE_HEIGHT + 2 * (BOX_PAD + BORDER)) };
};

/** Rows a label wraps to at `perRow` characters, breaking between words. */
export const wrappedRows = (text: string, perRow: number): number => {
  let rows = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (used > 0 && used + 1 + word.length <= perRow) {
      used += 1 + word.length;
      continue;
    }
    if (used > 0) rows += 1;
    // A word longer than a row breaks across rows.
    const extra = Math.floor((word.length - 1) / perRow);
    rows += extra;
    used = word.length - extra * perRow;
  }
  return rows;
};

/**
 * Offset that keeps the revealed part of the chain centred: 0 when every box
 * is in, half of the hidden length before that. Pure, so it is easy to test.
 */
export const flowCenterOffset = (
  revealed: number,
  count: number,
  box: number,
  arrow: number,
): number => {
  const shown = Math.max(1, Math.min(count, revealed));
  return ((count - shown) * (box + arrow)) / 2;
};

/**
 * 2 to 4 boxes joined by arrows. Each arrow draws toward the next box just
 * before it pops in; the newest box carries the accent. Left to right in
 * `long`, top to bottom in `short`.
 */
export const FlowScene: React.FC<SceneProps<FlowSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fontSize } = presets[preset];
  const zone = visualZoneSize(preset);
  const vertical = preset === "short";
  const n = scene.steps.length;
  const box = flowBoxSize(scene.steps, preset);
  // A tall column (labels that wrap) shortens its arrows to stay in the zone.
  const arrow = vertical
    ? Math.max(48, Math.min(ARROW[preset], (zone.height - n * box.height) / Math.max(1, n - 1)))
    : ARROW[preset];
  const reveals = listRevealFrames(n, durationInFrames, fps);
  const arrowFrames = framesAt(fps, 0.3);
  const dimFrames = framesAt(fps, beats.dim);
  // The chain glides so whatever is revealed so far sits in the middle; each
  // glide starts with the arrow into the next box.
  const along = vertical ? box.height : box.width;
  let offset = flowCenterOffset(1, n, along, arrow);
  for (let i = 1; i < n; i++) {
    const step = flowCenterOffset(i, n, along, arrow) - flowCenterOffset(i + 1, n, along, arrow);
    offset -= step * enter(frame, fps, (reveals[i] ?? 0) - arrowFrames);
  }

  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames} align="center">
      <div
        style={{
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          alignItems: "center",
          justifyContent: "flex-start",
          width: zone.width,
          height: zone.height,
          // Laid out from the start edge so the offset alone does the centring.
          ...(vertical
            ? { paddingTop: (zone.height - (n * box.height + (n - 1) * arrow)) / 2 }
            : { paddingLeft: (zone.width - (n * box.width + (n - 1) * arrow)) / 2 }),
          boxSizing: "border-box",
          transform: vertical ? `translateY(${offset.toFixed(2)}px)` : `translateX(${offset.toFixed(2)}px)`,
        }}
      >
        {scene.steps.map((step, i) => {
          const at = reveals[i] ?? 0;
          const pop = enter(frame, fps, at, true);
          const fade = enter(frame, fps, at);
          const next = reveals[i + 1];
          const active =
            next === undefined
              ? 1
              : interpolate(frame, [next, next + dimFrames], [1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
          const lit = frame >= at ? active : 0;
          // The arrow into box i draws during the frames just before it appears.
          const draw =
            i === 0
              ? 0
              : interpolate(frame, [at - arrowFrames, at], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.inOut(Easing.cubic),
                });
          return (
            <React.Fragment key={i}>
              {i > 0 ? <Arrow length={arrow} vertical={vertical} draw={draw} /> : null}
              <div
                style={{
                  width: box.width,
                  height: box.height,
                  flexShrink: 0,
                  boxSizing: "border-box",
                  padding: BOX_PAD,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceRaised,
                  border: `${BORDER}px solid ${lit > 0.01 ? colors.accent : colors.border}`,
                  boxShadow: `0 16px 48px rgba(0, 0, 0, 0.4), 0 0 ${Math.round(40 * lit)}px rgba(122, 162, 247, ${(0.45 * lit).toFixed(3)})`,
                  fontFamily: fonts.sans,
                  fontWeight: 700,
                  fontSize: fontSize.body,
                  lineHeight: LINE_HEIGHT,
                  color: colors.text,
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // Earlier boxes step back once the next one arrives.
                  opacity: Math.min(1, fade) * (0.75 + 0.25 * lit),
                  transform: `scale(${(0.7 + 0.3 * pop).toFixed(4)})`,
                }}
              >
                {step}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </SceneFrame>
  );
};

const Arrow: React.FC<{ length: number; vertical: boolean; draw: number }> = ({
  length,
  vertical,
  draw,
}) => {
  const thickness = 8;
  const head = 26;
  const shaft = Math.max(0, (length - spacing.md - head) * draw);
  return (
    <div
      style={{
        width: vertical ? head * 2 : length,
        height: vertical ? length : head * 2,
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: vertical ? thickness : shaft,
          height: vertical ? shaft : thickness,
          borderRadius: thickness,
          backgroundColor: colors.accent,
        }}
      />
      <svg
        width={head}
        height={head}
        viewBox="0 0 10 10"
        style={{ opacity: draw, transform: vertical ? "rotate(90deg)" : undefined, flexShrink: 0 }}
      >
        <polygon points="1,0 10,5 1,10" fill={colors.accent} />
      </svg>
    </div>
  );
};
