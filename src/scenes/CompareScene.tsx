import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CodeBlock } from "../components/CodeBlock";
import type { CompareScene as CompareSceneData, CompareSide } from "../schema/script";
import { colors, fonts, presets, radius, spacing, type PresetName } from "../theme";
import { enter, riseIn } from "./animation";
import { CheckMark, CrossMark } from "./marks";
import { SceneFrame, visualZoneSize } from "./SceneFrame";
import { beats, compareRevealFrames, framesAt } from "./timing";
import type { SceneProps } from "./types";

const GAP: Record<PresetName, number> = { short: spacing.md, long: spacing.lg };
const INNER: Record<PresetName, number> = { short: spacing.md, long: 40 };

/**
 * Wrong vs right: the wrong side with a red cross comes in first, then the
 * right side with a green check. Side by side in `long`, stacked in `short`.
 */
export const CompareScene: React.FC<SceneProps<CompareSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zone = visualZoneSize(preset);
  const stacked = preset === "short";
  const gap = GAP[preset];
  const panel = stacked
    ? { width: zone.width, height: (zone.height - gap) / 2 }
    : { width: (zone.width - gap) / 2, height: zone.height };
  const at = compareRevealFrames(durationInFrames, fps);

  // Once the right side is in, the wrong one steps back.
  const dim = interpolate(frame, [at.right, at.right + framesAt(fps, beats.dim)], [1, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames} align="center">
      <div
        style={{
          display: "flex",
          flexDirection: stacked ? "column" : "row",
          gap,
          width: zone.width,
          height: zone.height,
          justifyContent: "center",
          alignItems: "stretch",
        }}
      >
        <Panel
          kind="wrong"
          side={scene.wrong}
          language={scene.language}
          preset={preset}
          size={panel}
          revealAt={at.wrong}
          focus={dim}
        />
        <Panel
          kind="right"
          side={scene.right}
          language={scene.language}
          preset={preset}
          size={panel}
          revealAt={at.right}
          focus={1}
        />
      </div>
    </SceneFrame>
  );
};

const Panel: React.FC<{
  kind: "wrong" | "right";
  side: CompareSide;
  language: CompareSceneData["language"];
  preset: PresetName;
  size: { width: number; height: number };
  revealAt: number;
  focus: number;
}> = ({ kind, side, language, preset, size, revealAt, focus }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fontSize } = presets[preset];
  const color = kind === "wrong" ? colors.danger : colors.success;
  const progress = enter(frame, fps, revealAt);
  const rise = riseIn(progress);
  const markAt = revealAt + framesAt(fps, beats.secondary);
  const pop = enter(frame, fps, markAt, true);
  const draw = interpolate(frame, [markAt, markAt + framesAt(fps, 0.35)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const inner = INNER[preset];
  const header = Math.round(fontSize.body * 1.6);
  const mark = Math.round(header * 0.9);
  const body = {
    width: size.width - 2 * inner,
    height: size.height - header - 3 * inner,
  };
  // Labels get a red strike once the cross is drawn.
  const strike = kind === "wrong" ? draw : 0;
  const labelSize = Math.round((fontSize.body + fontSize.heading) / 2);

  return (
    <div
      style={{
        width: size.width,
        height: size.height,
        boxSizing: "border-box",
        padding: inner,
        display: "flex",
        flexDirection: "column",
        gap: inner,
        backgroundColor: colors.surface,
        border: `3px solid ${color}`,
        borderRadius: radius.lg,
        boxShadow: `0 20px 56px rgba(0, 0, 0, 0.4), 0 0 0 ${Math.round(6 * pop)}px ${color}22`,
        transform: rise.transform,
        opacity: Number(rise.opacity) * focus,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: spacing.sm, height: header }}>
        <div style={{ transform: `scale(${pop})` }}>
          {kind === "wrong" ? <CrossMark size={mark} draw={draw} /> : <CheckMark size={mark} draw={draw} />}
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontWeight: 800,
            fontSize: fontSize.body,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color,
          }}
        >
          {kind === "wrong" ? "Wrong" : "Right"}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: side.code !== undefined ? "flex-start" : "center",
        }}
      >
        {side.code !== undefined && language ? (
          <CodeBlock
            code={side.code}
            language={language}
            preset={preset}
            maxWidth={body.width}
            maxHeight={body.height}
          />
        ) : (
          <div style={{ position: "relative", textAlign: "center" }}>
            <span
              style={{
                fontFamily: fonts.sans,
                fontWeight: 700,
                fontSize: labelSize,
                lineHeight: 1.2,
                color: colors.text,
              }}
            >
              {side.label}
            </span>
            {strike > 0 ? (
              <div
                style={{
                  position: "absolute",
                  left: -spacing.xs,
                  right: -spacing.xs,
                  top: "52%",
                  height: Math.max(6, Math.round(labelSize * 0.09)),
                  borderRadius: 4,
                  backgroundColor: colors.danger,
                  transform: `scaleX(${strike})`,
                  transformOrigin: "left center",
                }}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
