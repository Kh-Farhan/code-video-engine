import React from "react";
import { AbsoluteFill } from "remotion";
import { Caption } from "../components/Caption";
import { Backdrop } from "../components/Backdrop";
import type { CaptionStyleName } from "../schema/script";
import { FPS, type PresetName } from "../theme";
import { captionChunkOptions } from "./layout";
import { captionScene } from "./scene";

const PREVIEW_NARRATION =
  // The em dash is intentional: captions turn it into a comma.
  "useMemo caches a computed value between renders. It only recomputes when a dependency changes, so expensive work runs once — not on every render.";

export const CAPTION_PREVIEW_FRAMES = FPS * 9;

const previewInput = {
  narration: PREVIEW_NARRATION,
  audioDurationInFrames: CAPTION_PREVIEW_FRAMES,
};

/** Studio preview: sample narration captioned with estimated timings, in either style. */
export const CaptionPreview: React.FC<{ preset: PresetName; variant: CaptionStyleName }> = ({
  preset,
  variant,
}) => (
  <AbsoluteFill>
    <Backdrop />
    <Caption
      chunks={captionScene(previewInput, captionChunkOptions[variant])}
      preset={preset}
      variant={variant}
    />
  </AbsoluteFill>
);
