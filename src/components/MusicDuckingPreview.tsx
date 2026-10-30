import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { Manifest, ManifestMusic } from "../schema/manifest";
import { colors, fonts, presets, spacing, type PresetName } from "../theme";
import { musicVolumeAt, narrationWindows } from "./musicDucking";

export type MusicDuckingPreviewProps = {
  manifest: Manifest;
  music: ManifestMusic;
  preset: PresetName;
};

/**
 * Studio preview for background music: plots the music volume over the whole
 * video, shades where narration speaks, and moves a playhead. Needs no audio
 * file, so it works without any music in public/.
 */
export const MusicDuckingPreview: React.FC<MusicDuckingPreviewProps> = ({
  manifest,
  music,
  preset,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { width, height, padding, fontSize } = presets[preset];
  const windows = useMemo(() => narrationWindows(manifest), [manifest]);
  const input = { windows, volume: music.volume, duckedVolume: music.duckedVolume, durationInFrames, fps };

  const chartWidth = width - 2 * padding;
  const chartHeight = Math.round(height * (preset === "short" ? 0.3 : 0.45));
  const x = (f: number) => (f / Math.max(1, durationInFrames - 1)) * chartWidth;
  // The loudest level sits at 90% of the chart height.
  const y = (v: number) => chartHeight - (v / Math.max(music.volume, 0.01)) * chartHeight * 0.9;
  const step = Math.max(1, Math.floor(durationInFrames / 400));
  const points: string[] = [];
  for (let f = 0; f < durationInFrames; f += step) {
    points.push(`${x(f).toFixed(1)},${y(musicVolumeAt(f, input)).toFixed(1)}`);
  }
  const current = musicVolumeAt(frame, input);
  const speaking = windows.some((w) => frame >= w.startFrame && frame < w.endFrame);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.background,
        padding,
        justifyContent: "center",
        gap: spacing.lg,
        fontFamily: fonts.sans,
        color: colors.text,
      }}
    >
      <div style={{ fontSize: fontSize.heading * 0.6, fontWeight: 800 }}>Music ducking</div>
      <svg width={chartWidth} height={chartHeight} style={{ overflow: "visible" }}>
        <rect width={chartWidth} height={chartHeight} fill={colors.surface} rx={12} />
        {windows.map((w, i) => (
          <rect
            key={i}
            x={x(w.startFrame)}
            width={Math.max(1, x(w.endFrame) - x(w.startFrame))}
            y={0}
            height={chartHeight}
            fill={colors.highlight}
          />
        ))}
        <polyline points={points.join(" ")} fill="none" stroke={colors.accent} strokeWidth={6} />
        <line
          x1={x(frame)}
          x2={x(frame)}
          y1={0}
          y2={chartHeight}
          stroke={colors.warning}
          strokeWidth={4}
        />
        <circle cx={x(frame)} cy={y(current)} r={14} fill={colors.warning} />
      </svg>
      <div style={{ fontSize: fontSize.body, color: colors.textMuted }}>
        {speaking ? "Narration speaking" : "Pause"}: volume{" "}
        <span style={{ color: colors.text, fontFamily: fonts.mono }}>{current.toFixed(2)}</span>
      </div>
    </AbsoluteFill>
  );
};
