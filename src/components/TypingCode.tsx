import React from "react";
import { useCurrentFrame } from "remotion";
import { FPS } from "../theme";
import { CodeBlock, type CodeBlockProps } from "./CodeBlock";
import { normalizeCode } from "./codeLayout";
import { TYPING_FINISH_FRACTION, typingEndFrame, visibleCharCount } from "./timing";

export type TypingCodeProps = Omit<CodeBlockProps, "visibleChars" | "cursorVisible"> & {
  /** Scene length. Typing finishes at `finishFraction` of it. */
  durationInFrames: number;
  finishFraction?: number;
};

/** Half a second on, half a second off. */
const BLINK_FRAMES = Math.round(FPS / 2);

/** Reveals the code character by character, then leaves a blinking caret for a moment. */
export const TypingCode: React.FC<TypingCodeProps> = ({
  durationInFrames,
  finishFraction = TYPING_FINISH_FRACTION,
  ...blockProps
}) => {
  const frame = useCurrentFrame();
  const total = normalizeCode(blockProps.code).length;
  const visible = visibleCharCount(frame, total, durationInFrames, finishFraction);
  const end = typingEndFrame(durationInFrames, finishFraction);
  // Solid while typing, then blinks for a second and goes away.
  const cursorVisible =
    frame < end || (frame < end + 2 * FPS && Math.floor((frame - end) / BLINK_FRAMES) % 2 === 1);

  return <CodeBlock {...blockProps} visibleChars={visible} cursorVisible={cursorVisible} />;
};
