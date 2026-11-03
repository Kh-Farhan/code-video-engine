import React, { useMemo } from "react";
import { AbsoluteFill, Html5Audio, Series, staticFile } from "remotion";
import { captionChunkOptions } from "../captions/layout";
import { chunksFromManifestCaptions } from "../captions/scene";
import { Backdrop } from "../components/Backdrop";
import { BackgroundMusic } from "../components/BackgroundMusic";
import { BrandHandle } from "../components/BrandHandle";
import { Caption } from "../components/Caption";
import { ProgressBar } from "../components/ProgressBar";
import { colors, DEFAULT_CAPTION_STYLE, DEFAULT_LOOK } from "../theme";
import type { ExplainerVideoProps } from "./explainerMetadata";
import { SceneRenderer } from "./SceneRenderer";

/**
 * The full video: every manifest scene in order, each with its own audio,
 * duration and captions, plus optional background music ducked under the
 * narration. Total length is set by `calculateExplainerMetadata`.
 */
export const ExplainerVideo: React.FC<ExplainerVideoProps> = ({
  manifest,
  preset,
  withAudio = true,
  withCaptions = true,
  look,
}) => {
  const captionStyle = manifest.style?.captions ?? DEFAULT_CAPTION_STYLE;
  const captionChunks = useMemo(
    () =>
      manifest.scenes.map((entry) =>
        chunksFromManifestCaptions(entry.captions, captionChunkOptions[captionStyle]),
      ),
    [manifest, captionStyle],
  );
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background }}>
      <Backdrop look={look ?? manifest.style?.look ?? DEFAULT_LOOK} />
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
            />
            {withAudio ? <Html5Audio src={staticFile(entry.audio)} /> : null}
            {withCaptions ? (
              <Caption chunks={captionChunks[i] ?? []} preset={preset} variant={captionStyle} />
            ) : null}
          </Series.Sequence>
        ))}
      </Series>
      {withAudio && manifest.music ? (
        <BackgroundMusic music={manifest.music} scenes={manifest.scenes} />
      ) : null}
      {manifest.brand ? <BrandHandle handle={manifest.brand.handle} preset={preset} /> : null}
      <ProgressBar />
    </AbsoluteFill>
  );
};
