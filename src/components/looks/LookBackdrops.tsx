import React, { useMemo } from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { brand, colors, lookColors, mixHex } from "../../theme";
import { blockSteps } from "./blocks";
import { Glows, hash01, rgba, Vignette } from "./parts";
import { moodAt, moodChanges, type LookScene } from "./timeline";

/** Mood colors crossfade over this long at a change. */
export const MOOD_FADE_SECONDS = 0.5;
/** The `blocks` wipe between two scene colors. */
export const BLOCK_WIPE_SECONDS = 0.4;

type LookBackdropProps = { timeline?: readonly LookScene[] };

/**
 * `editor`: a soft gradient in brand colors drifting very slowly behind the
 * editor window (EditorWindow draws the window itself).
 */
export const EditorBackdrop: React.FC = () => {
  const [amber, orange, blue] = lookColors.moods.accent;
  return (
    <AbsoluteFill style={{ backgroundColor: brand.base, overflow: "hidden" }}>
      <Glows
        swayX={0.12}
        swayY={0.08}
        glows={[
          { color: amber, x: 0.15, y: 0.15, period: 38, phase: 0, alpha: 0.3, size: 0.9 },
          { color: orange, x: 0.9, y: 0.55, period: 46, phase: 2.2, alpha: 0.22, size: 0.85 },
          { color: blue, x: 0.3, y: 0.92, period: 42, phase: 4.1, alpha: 0.26, size: 0.8 },
        ]}
      />
      <Vignette strength={0.4} />
    </AbsoluteFill>
  );
};

/** Pre-rendered noise, shifted to a new hashed offset a few times a second. */
const FilmGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.09 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  // A new offset every 2 frames reads as grain; the texture itself never changes.
  const step = Math.floor(frame / 2);
  const tile = 256;
  const dx = Math.floor(hash01(step, 1) * tile);
  const dy = Math.floor(hash01(step, 2) * tile);
  return (
    <AbsoluteFill style={{ overflow: "hidden", mixBlendMode: "overlay", opacity }}>
      <div
        style={{
          position: "absolute",
          left: -dx,
          top: -dy,
          width: width + tile,
          height: height + tile,
          backgroundImage: `url(${staticFile("textures/grain.png")})`,
          backgroundSize: `${tile}px ${tile}px`,
          backgroundRepeat: "repeat",
        }}
      />
      {/* Loads the texture before the first frame is captured. */}
      <Img src={staticFile("textures/grain.png")} style={{ display: "none" }} />
    </AbsoluteFill>
  );
};

/**
 * `aurora`: 3 big soft blobs drifting, colored by the story. Bug moments
 * (and the wrong side of a compare) glow warm, the fix glows green, the rest
 * is the brand accent. Colors crossfade at every change. Film grain on top.
 */
export const AuroraBackdrop: React.FC<LookBackdropProps> = ({ timeline = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const changes = useMemo(() => moodChanges(timeline), [timeline]);
  const { from, to, t } = moodAt(changes, frame, Math.round(fps * MOOD_FADE_SECONDS));
  const ease = Easing.inOut(Easing.quad)(t);
  const color = (i: number) =>
    mixHex(lookColors.moods[from][i] ?? brand.accent, lookColors.moods[to][i] ?? brand.accent, ease);
  const base = mixHex(brand.base, color(0), 0.05);
  return (
    <AbsoluteFill style={{ backgroundColor: base, overflow: "hidden" }}>
      <Glows
        swayX={0.2}
        swayY={0.12}
        glows={[
          { color: color(0), x: 0.2, y: 0.22, period: 17, phase: 0, alpha: 0.42, size: 0.95 },
          { color: color(1), x: 0.85, y: 0.5, period: 21, phase: 2, alpha: 0.32, size: 0.85 },
          { color: color(2), x: 0.35, y: 0.88, period: 19, phase: 4, alpha: 0.3, size: 0.8 },
        ]}
      />
      <Vignette strength={0.45} />
      <FilmGrain />
    </AbsoluteFill>
  );
};

/**
 * `blocks`: one flat saturated color per scene, built from the brand
 * tokens, with a quick diagonal wipe to the next color on every change.
 */
export const BlocksBackdrop: React.FC<LookBackdropProps> = ({ timeline = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = useMemo(() => blockSteps(moodChanges(timeline)), [timeline]);
  let index = 0;
  for (let i = 0; i < steps.length; i++) if ((steps[i]?.frame ?? 0) <= frame) index = i;
  const current = steps[index] ?? { frame: 0, color: colors.background };
  const previous = index > 0 ? steps[index - 1] : undefined;
  const wipe = previous
    ? interpolate(frame, [current.frame, current.frame + Math.round(fps * BLOCK_WIPE_SECONDS)], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      })
    : 1;
  // Alternate the wipe direction so consecutive changes do not look identical.
  const leftToRight = index % 2 === 0;
  // A diagonal edge: the leading corner runs from -40% to 140% of the width.
  const lead = -40 + wipe * 180;
  const trail = lead - 40;
  const polygon = leftToRight
    ? `polygon(-50% 0%, ${lead}% 0%, ${trail}% 100%, -50% 100%)`
    : `polygon(150% 0%, ${100 - lead}% 0%, ${100 - trail}% 100%, 150% 100%)`;
  return (
    <AbsoluteFill style={{ backgroundColor: previous?.color ?? current.color, overflow: "hidden" }}>
      {previous && wipe < 1 ? (
        <AbsoluteFill style={{ backgroundColor: current.color, clipPath: polygon }} />
      ) : (
        <AbsoluteFill style={{ backgroundColor: current.color }} />
      )}
      {/* A faint shade at the bottom so the frame does not feel like a flat swatch. */}
      <AbsoluteFill
        style={{ background: `linear-gradient(180deg, ${rgba("#000000", 0)} 55%, ${rgba("#000000", 0.18)} 100%)` }}
      />
    </AbsoluteFill>
  );
};
