/**
 * Pure timing helpers for scenes. No React, no Remotion runtime, so they are
 * easy to unit test. All values are in frames.
 */

/**
 * Entrance delays and short transitions, in seconds. Components convert them
 * with `framesAt(fps, ...)` so they hold at any manifest fps.
 */
export const beats = {
  /** Gap before the element that follows a scene's first element. */
  follow: 0.1,
  /** Gap before a heading that follows an accent bar. */
  heading: 0.15,
  /** Gap before secondary text such as a subheading or a glow. */
  secondary: 0.4,
  /** How long an earlier list item takes to dim. */
  dim: 0.33,
  /** Gap between words of a heading that comes in word by word. */
  wordStagger: 0.07,
  /** Fade at the end of every scene. */
  fadeOut: 0.25,
  /** Zoom and blur into a scene. */
  transitionIn: 0.3,
  /** Zoom and blur out of a scene. */
  transitionOut: 0.25,
} as const;

/** Frames for a duration given in seconds at `fps`. */
export const framesAt = (fps: number, seconds: number): number =>
  Math.round(fps * seconds);

/**
 * Frame (relative to scene start) at which each list item appears.
 * The first item shows almost immediately, and the reveals are spread evenly
 * so the last one lands around 70% of the scene, leaving time to read it.
 */
export const listRevealFrames = (
  count: number,
  durationInFrames: number,
  fps: number,
): number[] => {
  if (count <= 0) return [];
  const lead = Math.min(framesAt(fps, 0.3), Math.floor(durationInFrames / 4));
  const lastAt = Math.max(lead, Math.floor(durationInFrames * 0.7));
  const step = count > 1 ? (lastAt - lead) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => Math.round(lead + i * step));
};

/** 0 to 1 progress through a video, safe for single-frame videos. */
export const videoProgress = (frame: number, durationInFrames: number): number =>
  durationInFrames <= 1
    ? 1
    : Math.min(1, Math.max(0, frame / (durationInFrames - 1)));

/** Lead-in before the first element of a reveal, capped for very short scenes. */
const revealLead = (durationInFrames: number, fps: number): number =>
  Math.min(framesAt(fps, 0.3), Math.floor(durationInFrames / 4));

/**
 * When each side of a `compare` scene appears: the wrong side right away, the
 * right side at about 40% of the scene so the mistake has time to land.
 */
export const compareRevealFrames = (
  durationInFrames: number,
  fps: number,
): { wrong: number; right: number } => {
  const wrong = revealLead(durationInFrames, fps);
  const right = Math.max(wrong + 1, Math.round(durationInFrames * 0.4));
  return { wrong, right: Math.min(right, Math.max(wrong, durationInFrames - 1)) };
};

/**
 * When a `stat` scene's values appear. With a `from` value it shows first and
 * the main value lands at about 35%; without one the value shows right away.
 */
export const statRevealFrames = (
  durationInFrames: number,
  fps: number,
  hasFrom: boolean,
): { from: number; value: number } => {
  const lead = revealLead(durationInFrames, fps);
  if (!hasFrom) return { from: lead, value: lead };
  return { from: lead, value: Math.max(lead + 1, Math.round(durationInFrames * 0.35)) };
};

/**
 * Frames for an `output` scene: the command types in first (if any), then the
 * lines are spread like a list across the rest of the scene.
 */
export const outputRevealFrames = (
  lineCount: number,
  durationInFrames: number,
  fps: number,
  hasCommand: boolean,
): { commandEnd: number; lines: number[] } => {
  const lead = revealLead(durationInFrames, fps);
  const commandEnd = hasCommand
    ? Math.min(lead + framesAt(fps, 0.6), Math.floor(durationInFrames / 3))
    : 0;
  const rest = Math.max(1, durationInFrames - commandEnd);
  const lines = listRevealFrames(lineCount, rest, fps).map((f) => f + commandEnd);
  return { commandEnd, lines };
};

/** Zoom on the active code highlight. Small on purpose: a nudge, not a jump. */
export const CODE_PUNCH_SCALE = 1.045;
/** Extra bump while the highlight glides to the next step. */
export const CODE_PUNCH_PULSE = 0.015;
/** Slow push-in for code scenes without highlights, reached on the last frame. */
export const CODE_DRIFT_SCALE = 1.02;

/**
 * Scale for the code in a CodeScene at `frame`. Without highlights the code
 * drifts in slowly. With highlights it punches in when the first step starts
 * and gives a small bump on every later step change, so the frame changes
 * with each step. `starts` are the step start frames relative to
 * `highlightStart` (see codeHighlightStarts), so cued steps punch on their word.
 */
export const codePunchScale = (
  frame: number,
  durationInFrames: number,
  starts: readonly number[],
  highlightStart: number,
  transitionFrames: number,
): number => {
  if (starts.length === 0) {
    return 1 + (CODE_DRIFT_SCALE - 1) * videoProgress(frame, durationInFrames);
  }
  const local = frame - highlightStart;
  const span = Math.max(1, durationInFrames - highlightStart);
  if (local < (starts[0] ?? 0)) return 1;
  let step = 0;
  for (let i = 1; i < starts.length; i++) if (local >= starts[i]!) step = i;
  const stepStart = starts[step]!;
  const stepEnd = starts[step + 1] ?? Math.max(span, stepStart);
  const move = Math.max(1, Math.min(transitionFrames, (stepEnd - stepStart) / 2));
  const t = Math.min(1, Math.max(0, (local - stepStart) / move));
  const eased = 1 - (1 - t) ** 3;
  if (step === 0) return 1 + (CODE_PUNCH_SCALE - 1) * eased;
  return CODE_PUNCH_SCALE + CODE_PUNCH_PULSE * Math.sin(Math.PI * t);
};
