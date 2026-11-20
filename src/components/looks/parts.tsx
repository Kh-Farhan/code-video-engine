import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

/** Shared building blocks for the backdrops. Everything is a function of the frame. */

/** "#rrggbb" to "rgba(r, g, b, alpha)". */
export const rgba = (hex: string, alpha: number): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** -1 to 1, one full cycle every `periodSeconds`. */
export const wave = (frame: number, fps: number, periodSeconds: number, phase = 0): number =>
  Math.sin((2 * Math.PI * frame) / (fps * periodSeconds) + phase);

/** Deterministic 0 to 1 value for item `i`, property `k`. */
export const hash01 = (i: number, k: number): number => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export type Glow = {
  color: string;
  x: number;
  y: number;
  period: number;
  phase: number;
  alpha: number;
  size: number;
};

/** Large soft lights that drift on slow loops. Sizes are fractions of the longer side. */
export const Glows: React.FC<{ glows: Glow[]; swayX: number; swayY: number }> = ({
  glows,
  swayX,
  swayY,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const long = Math.max(width, height);
  return (
    <>
      {glows.map((g, i) => {
        const size = g.size * long;
        const cx = g.x * width + wave(frame, fps, g.period, g.phase) * width * swayX;
        const cy = g.y * height + wave(frame, fps, g.period * 1.37, g.phase + 1.3) * height * swayY;
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
              background: `radial-gradient(circle, ${rgba(g.color, g.alpha)} 0%, ${rgba(g.color, g.alpha * 0.35)} 35%, ${rgba(g.color, 0)} 68%)`,
            }}
          />
        );
      })}
    </>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.5 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at center, transparent 50%, ${rgba("#000000", strength)} 100%)`,
    }}
  />
);
