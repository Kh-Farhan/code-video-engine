import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { brand, colors, fonts, spacing, type PresetName } from "../../theme";
import { editorWindowLayout, wordmarkBox } from "./layout";
import { sceneIndexAt, type LookScene } from "./timeline";

/** The tab label crossfades this long at a scene change. */
const TAB_FADE_SECONDS = 0.2;

/**
 * The `editor` look's window: rounded, with a title bar (traffic lights and
 * a filename tab for the current scene), drawn once for the whole video so
 * it stays still while scenes change inside it. Scenes draw on top of the
 * window body (see lookVisualZone); code scenes skip their own card.
 */
export const EditorWindow: React.FC<{ preset: PresetName; timeline: readonly LookScene[] }> = ({
  preset,
  timeline,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { window: box, titleBarHeight: bar } = editorWindowLayout(preset);
  const mark = wordmarkBox(preset);
  const index = sceneIndexAt(timeline, frame);
  const scene = timeline[index];
  const since = frame - (scene?.start ?? 0);
  const tabIn = index === 0 ? 1 : interpolate(since, [0, Math.round(fps * TAB_FADE_SECONDS)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dot = Math.round(bar * 0.2);
  const tabFont = Math.round(bar * (preset === "short" ? 0.4 : 0.42));
  // In `short` the FG mark sits at the left end of the title bar, so the
  // traffic lights start after it.
  const lightsLeft =
    preset === "short" ? mark.left + mark.width + spacing.md - box.left : spacing.md;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          boxSizing: "border-box",
          borderRadius: 28,
          border: `2px solid ${colors.border}`,
          backgroundColor: colors.surface,
          boxShadow: "0 40px 120px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.03) inset",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
            height: bar,
            display: "flex",
            alignItems: "flex-end",
            backgroundColor: "#0d121c",
            borderBottom: `2px solid ${colors.border}`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: lightsLeft,
              top: (bar - dot) / 2,
              display: "flex",
              gap: Math.round(dot * 0.6),
            }}
          >
            {[brand.bug, brand.accent, brand.fix].map((c) => (
              <div key={c} style={{ width: dot, height: dot, borderRadius: dot, backgroundColor: c }} />
            ))}
          </div>
          <div
            style={{
              marginLeft: lightsLeft + 3 * dot + 2 * Math.round(dot * 0.6) + spacing.md,
              height: Math.round(bar * 0.74),
              lineHeight: `${Math.round(bar * 0.74)}px`,
              padding: `0 ${spacing.md}px`,
              marginBottom: -2,
              backgroundColor: colors.surface,
              borderTop: `3px solid ${brand.accent}`,
              borderLeft: `2px solid ${colors.border}`,
              borderRight: `2px solid ${colors.border}`,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              fontFamily: fonts.mono,
              fontSize: tabFont,
              color: colors.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "62%",
            }}
          >
            <span style={{ opacity: tabIn }}>{scene?.filename ?? "README.md"}</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
