import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { colors } from "../theme";

export const backdropNames = ["classic", "aurora", "grid"] as const;
export type BackdropName = (typeof backdropNames)[number];

type BackdropProps = {
  variant?: BackdropName;
};

/**
 * The video's background, drawn once behind every scene so its motion runs
 * continuously across scene changes. Driven by the frame only.
 */
export const Backdrop: React.FC<BackdropProps> = ({ variant = "classic" }) => {
  switch (variant) {
    case "classic":
      return <ClassicBackdrop />;
    case "aurora":
      return <AuroraBackdrop />;
    case "grid":
      return <GridBackdrop />;
  }
};

/** The original look: navy with a static glow in the top left. */
const ClassicBackdrop: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: colors.background,
      backgroundImage: `radial-gradient(circle at 15% 10%, ${colors.surfaceRaised} 0%, ${colors.background} 55%)`,
    }}
  />
);

/** "#rrggbb" to "rgba(r, g, b, alpha)". */
const rgba = (hex: string, alpha: number): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** Slow loop position: one full cycle every `periodSeconds`. */
const wave = (frame: number, fps: number, periodSeconds: number, phase = 0): number =>
  Math.sin((2 * Math.PI * frame) / (fps * periodSeconds) + phase);

/** Soft colored light drifting slowly over the dark base, with a faint dot grid. */
const AuroraBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const size = Math.max(width, height) * 0.9;
  const blobs = [
    { color: colors.accent, x: 0.2, y: 0.2, period: 23, phase: 0, alpha: 0.32 },
    { color: colors.accentAlt, x: 0.85, y: 0.45, period: 29, phase: 2, alpha: 0.26 },
    { color: "#2ac3de", x: 0.35, y: 0.9, period: 31, phase: 4, alpha: 0.18 },
  ];
  const dot = Math.round(Math.min(width, height) / 30);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, overflow: "hidden" }}>
      {blobs.map((b, i) => {
        const cx = b.x * width + wave(frame, fps, b.period, b.phase) * width * 0.12;
        const cy = b.y * height + wave(frame, fps, b.period * 1.3, b.phase + 1) * height * 0.08;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cx - size / 2,
              top: cy - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${rgba(b.color, b.alpha)} 0%, ${rgba(b.color, 0)} 65%)`,
            }}
          />
        );
      })}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${rgba("#ffffff", 0.07)} 1.5px, transparent 1.5px)`,
          backgroundSize: `${dot}px ${dot}px`,
          backgroundPosition: `0px ${(frame * 0.3) % dot}px`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 55%, ${rgba("#000000", 0.45)} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** A floor grid scrolling toward the viewer under a glowing horizon. */
const GridBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const cell = Math.round(Math.min(width, height) / 12);
  // One cell every second and a half, so it reads as calm motion.
  const offset = ((frame / fps) * (cell / 1.5)) % cell;
  const horizon = height * 0.58;
  const line = rgba(colors.accent, 0.22);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${colors.background} 0%, ${rgba(colors.accentAlt, 0.1)} ${(horizon / height) * 100}%, ${colors.background} 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -width,
          width: width * 3,
          top: horizon,
          height: height * 1.2,
          transformOrigin: "top center",
          transform: "perspective(700px) rotateX(70deg)",
          backgroundImage: `linear-gradient(${line} 2px, transparent 2px), linear-gradient(90deg, ${line} 2px, transparent 2px)`,
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `0px ${offset}px`,
          maskImage: "linear-gradient(180deg, transparent 0%, black 35%)",
          WebkitMaskImage: "linear-gradient(180deg, transparent 0%, black 35%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: horizon - 2,
          height: 4,
          background: `linear-gradient(90deg, transparent, ${colors.accent}, ${colors.accentAlt}, transparent)`,
          boxShadow: `0 0 40px 10px ${rgba(colors.accent, 0.35)}`,
          opacity: 0.8 + 0.2 * wave(frame, fps, 4),
        }}
      />
    </AbsoluteFill>
  );
};
