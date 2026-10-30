import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Series,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { chunksFromManifestCaptions } from "../captions/scene";
import { Caption } from "../components/Caption";
import { colors } from "../theme";
import type { ExplainerVideoProps } from "./explainerMetadata";
import { SceneRenderer } from "./SceneRenderer";
import { videoProgress } from "./timing";

/** Thin bar along the top edge showing how far into the video we are. */
const VideoProgress: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          height: 8,
          width: "100%",
          backgroundColor: "rgba(255, 255, 255, 0.08)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: "100%",
            background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentAlt})`,
            transform: `scaleX(${videoProgress(frame, durationInFrames)})`,
            transformOrigin: "left center",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/**
 * The full video: every manifest scene in order, each with its own audio,
 * duration and captions. Total length is set by `calculateExplainerMetadata`.
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
      <VideoProgress />
    </AbsoluteFill>
  );
};
