import React from "react";
import { AbsoluteFill } from "remotion";
import { Caption } from "../components/Caption";
import { colors, FPS, type PresetName } from "../theme";
import { captionScene } from "./scene";

const PREVIEW_NARRATION =
  // The em dash is intentional: captions turn it into a comma.
  "useMemo caches a computed value between renders. It only recomputes when a dependency changes, so expensive work runs once — not on every render.";

export const CAPTION_PREVIEW_FRAMES = FPS * 9;

const previewChunks = captionScene({
  narration: PREVIEW_NARRATION,
  audioDurationInFrames: CAPTION_PREVIEW_FRAMES,
});

/** Studio preview: sample narration captioned with estimated timings. */
export const CaptionPreview: React.FC<{ preset: PresetName }> = ({ preset }) => (
  <AbsoluteFill style={{ backgroundColor: colors.background }}>
    <Caption chunks={previewChunks} preset={preset} />
  </AbsoluteFill>
);
