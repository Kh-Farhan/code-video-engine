import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { CodeBlock, type CodeBlockProps } from "./CodeBlock";
import { normalizeCode } from "./codeLayout";
import { TYPING_FINISH_FRACTION, typingEndFrame, visibleCharCount } from "./timing";

export type TypingCodeProps = Omit<CodeBlockProps, "visibleChars" | "cursorVisible"> & {
  /** Scene length. Typing finishes at `finishFraction` of it. */
  durationInFrames: number;
  finishFraction?: number;
  /** Keep the caret blinking slowly until the scene ends (the editor look). */
  persistentCursor?: boolean;
};

/** Caret blink: half a second on, half a second off, for two seconds after typing. */
const BLINK_SECONDS = 0.5;
const BLINK_FOR_SECONDS = 2;
/** The editor look's slow caret: on and off for this long each. */
export const SLOW_BLINK_SECONDS = 0.6;

/** Slow caret blink, starting "on" at `from`. Deterministic: frame only. */
export const slowBlinkOn = (frame: number, fps: number, from = 0): boolean =>
  Math.floor(Math.max(0, frame - from) / Math.max(1, Math.round(fps * SLOW_BLINK_SECONDS))) % 2 === 0;

/** Reveals the code character by character, then leaves a blinking caret for a moment. */
export const TypingCode: React.FC<TypingCodeProps> = ({
  durationInFrames,
  finishFraction = TYPING_FINISH_FRACTION,
  persistentCursor = false,
  ...blockProps
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const blinkFrames = Math.max(1, Math.round(fps * BLINK_SECONDS));
  const total = normalizeCode(blockProps.code).length;
  const visible = visibleCharCount(frame, total, durationInFrames, finishFraction);
  const end = typingEndFrame(durationInFrames, finishFraction);
  // Solid while typing, then blinks for a moment and goes away.
  const cursorVisible =
    frame < end ||
    (persistentCursor
      ? slowBlinkOn(frame, fps, end)
      : frame < end + Math.round(fps * BLINK_FOR_SECONDS) &&
        Math.floor((frame - end) / blinkFrames) % 2 === 1);

  return <CodeBlock {...blockProps} visibleChars={visible} cursorVisible={cursorVisible} />;
};
