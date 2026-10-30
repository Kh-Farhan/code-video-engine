import React, { useMemo } from "react";
import { AbsoluteFill, Html5Audio, Series, staticFile } from "remotion";
import { chunksFromManifestCaptions } from "../captions/scene";
import { BackgroundMusic } from "../components/BackgroundMusic";
import { Caption } from "../components/Caption";
import { ProgressBar } from "../components/ProgressBar";
import { colors } from "../theme";
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
}) => {
  const captionChunks = useMemo(
    () => manifest.scenes.map((entry) => chunksFromManifestCaptions(entry.captions)),
    [manifest],
  );
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background }}>
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
            />
            {withAudio ? <Html5Audio src={staticFile(entry.audio)} /> : null}
            {withCaptions ? (
              <Caption chunks={captionChunks[i] ?? []} preset={preset} />
            ) : null}
          </Series.Sequence>
        ))}
      </Series>
      {withAudio && manifest.music ? (
        <BackgroundMusic music={manifest.music} scenes={manifest.scenes} />
      ) : null}
      <ProgressBar />
    </AbsoluteFill>
  );
};
