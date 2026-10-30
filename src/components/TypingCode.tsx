import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { CodeBlock, type CodeBlockProps } from "./CodeBlock";
import { normalizeCode } from "./codeLayout";
import { TYPING_FINISH_FRACTION, typingEndFrame, visibleCharCount } from "./timing";

export type TypingCodeProps = Omit<CodeBlockProps, "visibleChars" | "cursorVisible"> & {
  /** Scene length. Typing finishes at `finishFraction` of it. */
  durationInFrames: number;
  finishFraction?: number;
};

/** Caret blink: half a second on, half a second off, for two seconds after typing. */
const BLINK_SECONDS = 0.5;
const BLINK_FOR_SECONDS = 2;

/** Reveals the code character by character, then leaves a blinking caret for a moment. */
export const TypingCode: React.FC<TypingCodeProps> = ({
  durationInFrames,
  finishFraction = TYPING_FINISH_FRACTION,
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
    (frame < end + Math.round(fps * BLINK_FOR_SECONDS) &&
      Math.floor((frame - end) / blinkFrames) % 2 === 1);

  return <CodeBlock {...blockProps} visibleChars={visible} cursorVisible={cursorVisible} />;
};
