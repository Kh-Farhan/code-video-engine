import React, { useCallback, useMemo } from "react";
import { Html5Audio, staticFile, useVideoConfig } from "remotion";
import type { Manifest, ManifestMusic } from "../schema/manifest";
import { musicVolumeAt, narrationWindows } from "./musicDucking";

type BackgroundMusicProps = {
  music: ManifestMusic;
  /** Scenes the music plays under; their captions mark where narration speaks. */
  scenes: Manifest["scenes"];
};

/**
 * Loops a music track under the whole video, ducked while narration speaks.
 * Place it at the top level of the composition so its frames match the video's.
 */
export const BackgroundMusic: React.FC<BackgroundMusicProps> = ({ music, scenes }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const windows = useMemo(() => narrationWindows({ scenes }), [scenes]);
  const volume = useCallback(
    (frame: number) =>
      musicVolumeAt(frame, {
        windows,
        volume: music.volume,
        duckedVolume: music.duckedVolume,
        durationInFrames,
        fps,
      }),
    [windows, music.volume, music.duckedVolume, durationInFrames, fps],
  );
  return (
    <Html5Audio
      src={staticFile(music.src)}
      name="Background music"
      loop
      // Volume frames keep counting across loops instead of restarting at 0.
      loopVolumeCurveBehavior="extend"
      volume={volume}
    />
  );
};
