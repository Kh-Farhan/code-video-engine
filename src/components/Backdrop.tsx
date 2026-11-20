import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { LookName } from "../schema/script";
import { colors, DEFAULT_LOOK } from "../theme";
import { AuroraBackdrop, BlocksBackdrop, EditorBackdrop } from "./looks/LookBackdrops";
import { Glows, hash01, rgba, Vignette, wave } from "./looks/parts";
import type { LookScene } from "./looks/timeline";

type BackdropProps = {
  look?: LookName;
  /** Scene timing and moods, for looks that change with the scenes (aurora, blocks). */
  timeline?: readonly LookScene[];
};

export { hash01 };

/**
 * The video's background, drawn once behind every scene so its motion runs
 * continuously across scene changes. Everything is a function of the frame,
 * including the particles, which use a fixed hash instead of Math.random.
 */
export const Backdrop: React.FC<BackdropProps> = ({ look = DEFAULT_LOOK, timeline }) => {
  switch (look) {
    case "classic":
      return <ClassicBackdrop />;
    case "aurora":
      return <AuroraBackdrop timeline={timeline} />;
    case "grid":
      return <GridBackdrop />;
    case "editor":
      return <EditorBackdrop />;
    case "blocks":
      return <BlocksBackdrop timeline={timeline} />;
  }
};

const TEAL = "#2ac3de";

/** The original look: navy with a static glow in the top left. */
const ClassicBackdrop: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: colors.background,
      backgroundImage: `radial-gradient(circle at 15% 10%, ${colors.surfaceRaised} 0%, ${colors.background} 55%)`,
    }}
  />
);

/** Small lights rising slowly and twinkling, inside the top `areaFraction` of the frame. */
const Particles: React.FC<{ count: number; areaFraction?: number }> = ({ count, areaFraction = 1 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const area = height * areaFraction;
  const unit = Math.min(width, height) / 1080;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const speed = (14 + hash01(i, 2) * 26) * unit;
        const y = (((hash01(i, 3) * area - t * speed) % area) + area) % area;
        const x = hash01(i, 1) * width + Math.sin(t * 0.6 + i) * 12 * unit;
        const size = (2 + hash01(i, 4) * 4) * unit;
        const twinkle = 0.5 + 0.5 * Math.sin(t * (1.2 + hash01(i, 5) * 1.6) + i * 2.1);
        // Fade in at the bottom of the area and out at the top.
        const edge = Math.min(1, y / (area * 0.15), (area - y) / (area * 0.15));
        const color = hash01(i, 6) > 0.65 ? colors.accentAlt : i % 3 === 0 ? TEAL : "#ffffff";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: color,
              opacity: (0.15 + 0.55 * twinkle) * edge,
              boxShadow: `0 0 ${size * 3}px ${rgba(color === "#ffffff" ? colors.accent : color, 0.8)}`,
            }}
          />
        );
      })}
    </>
  );
};

/** A floor grid rolling toward the viewer under a glowing horizon and drifting sky light. */
const GridBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const cell = Math.round(Math.min(width, height) / 11);
  // One cell per second: clearly moving, still calm behind code.
  const offset = ((frame / fps) * cell) % cell;
  // Portrait: between the content and the captions. Landscape: below the
  // content, so the bright line never runs through text.
  const horizonFraction = height > width ? 0.58 : 0.74;
  const horizon = height * horizonFraction;
  const line = rgba(colors.accent, 0.3);
  const pulse = 0.85 + 0.15 * wave(frame, fps, 4);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${colors.background} 0%, ${rgba(colors.accentAlt, 0.14)} ${(horizon / height) * 100}%, ${colors.background} 100%)`,
        }}
      />
      <Glows
        swayX={0.28}
        swayY={0.05}
        glows={[
          { color: colors.accent, x: 0.25, y: horizonFraction - 0.08, period: 14, phase: 0, alpha: 0.34, size: 0.7 },
          { color: colors.accentAlt, x: 0.78, y: horizonFraction - 0.12, period: 18, phase: 2.5, alpha: 0.3, size: 0.65 },
          { color: TEAL, x: 0.5, y: 0.18, period: 21, phase: 4, alpha: 0.14, size: 0.6 },
        ]}
      />
      <Particles count={22} areaFraction={horizonFraction} />
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
          maskImage: "linear-gradient(180deg, transparent 0%, black 30%)",
          WebkitMaskImage: "linear-gradient(180deg, transparent 0%, black 30%)",
        }}
      />
      {/* Glow pooled on the horizon, then the bright line itself. */}
      <div
        style={{
          position: "absolute",
          left: width * 0.1,
          width: width * 0.8,
          top: horizon - height * 0.08,
          height: height * 0.16,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${rgba(colors.accent, 0.3 * pulse)} 0%, transparent 70%)`,
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
          opacity: pulse,
        }}
      />
      <Vignette strength={0.45} />
    </AbsoluteFill>
  );
};
