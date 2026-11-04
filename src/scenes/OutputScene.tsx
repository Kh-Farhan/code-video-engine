import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { OutputScene as OutputSceneData } from "../schema/script";
import { colors, fonts, radius, spacing, type PresetName } from "../theme";
import { enter, riseIn } from "./animation";
import { SceneFrame, visualZoneSize } from "./SceneFrame";
import { beats, framesAt, outputRevealFrames } from "./timing";
import type { SceneProps } from "./types";

/** Output font size bounds per preset. `short` stays at phone-readable sizes. */
const FONT: Record<PresetName, { max: number; min: number }> = {
  short: { max: 48, min: 34 },
  long: { max: 44, min: 28 },
};
const CHAR_EM = 0.6;
const LINE_EM = 1.5;
const INNER: Record<PresetName, number> = { short: spacing.lg, long: spacing.lg };

/**
 * A terminal panel. The command (if any) types in after a prompt, then each
 * output line appears in turn, the newest one bright and the cursor blinking
 * after it.
 */
export const OutputScene: React.FC<SceneProps<OutputSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zone = visualZoneSize(preset);
  const inner = INNER[preset];
  const textWidth = zone.width - 2 * inner;
  const all = [...(scene.command ? [`$ ${scene.command}`] : []), ...scene.lines];
  const longest = Math.max(1, ...all.map((l) => l.length));
  const font = Math.round(
    Math.max(FONT[preset].min, Math.min(FONT[preset].max, textWidth / (longest * CHAR_EM))),
  );
  const { commandEnd, lines: reveals } = outputRevealFrames(
    scene.lines.length,
    durationInFrames,
    fps,
    scene.command !== undefined,
  );
  const panel = riseIn(enter(frame, fps, 0));
  const commandChars = scene.command
    ? Math.round(
        interpolate(frame, [framesAt(fps, beats.follow), commandEnd], [0, scene.command.length], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      )
    : 0;
  const shown = reveals.filter((at) => frame >= at).length;
  const blinkOn = Math.floor(frame / Math.max(1, framesAt(fps, 0.5))) % 2 === 0;
  const dot = Math.round(font * 0.45);
  const cursor = (
    <span
      style={{
        display: "inline-block",
        width: Math.round(font * 0.55),
        height: Math.round(font * 1.05),
        marginLeft: 4,
        verticalAlign: "text-bottom",
        backgroundColor: colors.accent,
        opacity: blinkOn ? 1 : 0,
      }}
    />
  );

  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames} align="center">
      <div
        style={{
          width: zone.width,
          maxHeight: zone.height,
          backgroundColor: "#07090f",
          border: `2px solid ${colors.border}`,
          borderRadius: radius.lg,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.5)",
          ...panel,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.sm,
            padding: `${spacing.sm}px ${inner}px`,
            backgroundColor: colors.surfaceRaised,
            borderBottom: `2px solid ${colors.border}`,
          }}
        >
          {[colors.danger, colors.warning, colors.success].map((c) => (
            <div key={c} style={{ width: dot, height: dot, borderRadius: dot, backgroundColor: c }} />
          ))}
          <div
            style={{
              marginLeft: spacing.sm,
              fontFamily: fonts.mono,
              fontSize: Math.round(font * 0.75),
              color: colors.textMuted,
            }}
          >
            {scene.title ?? "Terminal"}
          </div>
        </div>
        <div
          style={{
            padding: inner,
            fontFamily: fonts.mono,
            fontSize: font,
            lineHeight: LINE_EM,
            color: colors.text,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            fontVariantLigatures: "none",
          }}
        >
          {scene.command ? (
            <div>
              <span style={{ color: colors.success }}>$ </span>
              {scene.command.slice(0, commandChars)}
              {shown === 0 ? cursor : null}
            </div>
          ) : null}
          {scene.lines.map((line, i) => {
            const at = reveals[i] ?? 0;
            if (frame < at) return null;
            const p = enter(frame, fps, at);
            const newest = i === shown - 1;
            return (
              <div
                key={i}
                style={{
                  opacity: Math.min(1, p * 1.4) * (newest ? 1 : 0.7),
                  transform: `translateX(${(1 - Math.min(1, p)) * 16}px)`,
                }}
              >
                {line}
                {newest ? cursor : null}
              </div>
            );
          })}
          {!scene.command && shown === 0 ? <div>{cursor}</div> : null}
        </div>
      </div>
    </SceneFrame>
  );
};
