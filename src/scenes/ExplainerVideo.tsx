import React, { useMemo } from "react";
import { AbsoluteFill, Html5Audio, Series, staticFile } from "remotion";
import { sceneCaptions } from "../captions/pages";
import { chunksFromManifestCaptions } from "../captions/scene";
import { Backdrop } from "../components/Backdrop";
import { BackgroundMusic } from "../components/BackgroundMusic";
import { BrandHandle } from "../components/BrandHandle";
import { Caption } from "../components/Caption";
import { EditorWindow } from "../components/looks/EditorWindow";
import { LookProvider } from "../components/looks/LookContext";
import { lookTimeline } from "../components/looks/timeline";
import { Wordmark } from "../components/looks/Wordmark";
import { ProgressBar } from "../components/ProgressBar";
import { SafeAreaOverlay } from "../components/SafeAreaOverlay";
import { colors, DEFAULT_CAPTION_STYLE, DEFAULT_LOOK } from "../theme";
import type { ExplainerVideoProps } from "./explainerMetadata";
import { SceneRenderer } from "./SceneRenderer";

/**
 * The full video: every manifest scene in order, each with its duration and
 * captions, plus optional background music ducked under the narration.
 * Narration is one continuous track from frame 0 (`manifest.narration`), or,
 * in older and --per-scene-audio manifests, one file per scene. Total length
 * is set by `calculateExplainerMetadata`.
 */
export const ExplainerVideo: React.FC<ExplainerVideoProps> = ({
  manifest,
  preset,
  withAudio = true,
  withCaptions = true,
  look,
  debugSafeArea = false,
}) => {
  const captionStyle = manifest.style?.captions ?? DEFAULT_CAPTION_STYLE;
  const resolvedLook = look ?? manifest.style?.look ?? DEFAULT_LOOK;
  // Scene starts, tabs and moods for the looks that follow the scenes.
  const timeline = useMemo(
    () => lookTimeline(manifest.scenes, manifest.fps),
    [manifest],
  );
  // Caption[] per scene: word timings when the manifest has them, estimated otherwise.
  const captions = useMemo(
    () => manifest.scenes.map((entry) => sceneCaptions(entry, manifest.fps)),
    [manifest],
  );
  // Word timings in frames, for scenes that time steps to spoken cues.
  const sceneWords = useMemo(
    () =>
      manifest.scenes.map((entry) =>
        chunksFromManifestCaptions(entry.captions).flatMap((c) => c.words),
      ),
    [manifest],
  );
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background }}>
      <Backdrop look={resolvedLook} timeline={timeline} />
      {resolvedLook === "editor" ? <EditorWindow preset={preset} timeline={timeline} /> : null}
      <LookProvider look={resolvedLook}>
      <Series>
        {manifest.scenes.map((entry, i) => (
          <Series.Sequence
            key={i}
            name={`${i + 1}. ${entry.scene.type}`}
            durationInFrames={entry.durationInFrames}
          >
            <SceneRenderer
              scene={entry.scene}
              preset={preset}
              durationInFrames={entry.durationInFrames}
              handle={manifest.brand?.handle}
              words={sceneWords[i]}
            />
            {withAudio && entry.audio && !manifest.narration ? (
              <Html5Audio src={staticFile(entry.audio)} />
            ) : null}
            {withCaptions ? (
              <Caption captions={captions[i] ?? []} preset={preset} variant={captionStyle} />
            ) : null}
          </Series.Sequence>
        ))}
      </Series>
      </LookProvider>
      <Wordmark preset={preset} />
      {withAudio && manifest.narration ? (
        <Html5Audio src={staticFile(manifest.narration.src)} name="Narration" />
      ) : null}
      {withAudio && manifest.music ? (
        <BackgroundMusic music={manifest.music} scenes={manifest.scenes} />
      ) : null}
      {manifest.brand ? <BrandHandle handle={manifest.brand.handle} preset={preset} /> : null}
      <ProgressBar />
      {debugSafeArea ? <SafeAreaOverlay preset={preset} /> : null}
    </AbsoluteFill>
  );
};
