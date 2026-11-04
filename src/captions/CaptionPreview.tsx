import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Caption } from "../components/Caption";
import { SafeAreaOverlay } from "../components/SafeAreaOverlay";
import { CodeScene } from "../scenes/CodeScene";
import { previewCodeScenes } from "../scenes/codeScenePreview";
import type { CaptionStyleName } from "../schema/script";
import { FPS, type PresetName } from "../theme";
import { sceneCaptions, wordsToCaptions, type Caption as CaptionData } from "./pages";
import { distributeWordTimings } from "./timing";

const PREVIEW_NARRATION =
  // The em dash is intentional: captions turn it into a comma.
  "useMemo caches a computed value between renders. It only recomputes when a dependency changes, so expensive work runs once — not on every render.";

export const CAPTION_PREVIEW_FRAMES = FPS * 9;

/** Sentence cues only: shows the fallback to estimated word timings. */
const estimated = (): CaptionData[] =>
  sceneCaptions(
    {
      granularity: "sentence",
      cues: [{ text: PREVIEW_NARRATION, startFrame: 0, endFrame: CAPTION_PREVIEW_FRAMES - FPS }],
    },
    FPS,
  );

/**
 * Word timings with uneven pacing and a pause between sentences, the way a
 * transcription looks. Built from frames so it is identical on every render.
 */
const wordTimed = (): CaptionData[] => {
  const [first, second] = PREVIEW_NARRATION.split(/(?<=\.)\s+/) as [string, string];
  const a = distributeWordTimings(first.split(" "), 0, FPS * 3);
  // A 0.6 second pause, then a faster second sentence.
  const b = distributeWordTimings(second.replace(" —", ",").split(" "), Math.round(FPS * 3.6), FPS * 8);
  return wordsToCaptions([...a, ...b], FPS);
};

// Built once, so the caption pages are not recomputed every frame.
const previewCaptions = { words: wordTimed(), estimated: estimated() } as const;

export type CaptionPreviewProps = {
  preset: PresetName;
  variant: CaptionStyleName;
  /** "words" uses word timings; "estimated" uses one sentence cue (no word timings yet). */
  timing?: "words" | "estimated";
  /** Draws the platform safe area, visual zone and caption band. */
  debugSafeArea?: boolean;
};

/**
 * Studio preview: a code scene in the visual zone with captions in the band
 * below it, so the split and the safe area can be checked in both presets.
 */
export const CaptionPreview: React.FC<CaptionPreviewProps> = ({
  preset,
  variant,
  timing = "words",
  debugSafeArea = false,
}) => {
  const { scene, filename } = previewCodeScenes.highlight;
  return (
    <AbsoluteFill>
      <Backdrop />
      <CodeScene
        scene={scene}
        preset={preset}
        durationInFrames={CAPTION_PREVIEW_FRAMES}
        filename={filename}
      />
      <Caption
        captions={previewCaptions[timing]}
        preset={preset}
        variant={variant}
      />
      {debugSafeArea ? <SafeAreaOverlay preset={preset} /> : null}
    </AbsoluteFill>
  );
};
