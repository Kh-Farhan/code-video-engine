import React from "react";
import { Composition, Folder } from "remotion";
import { CAPTION_PREVIEW_FRAMES, CaptionPreview } from "./captions/CaptionPreview";
import { MusicDuckingPreview } from "./components/MusicDuckingPreview";
import { CodeScene } from "./scenes/CodeScene";
import { estimatePreviewFrames, previewCodeScenes } from "./scenes/codeScenePreview";
import { ExplainerVideo } from "./scenes/ExplainerVideo";
import {
  calculateExplainerMetadata,
  type ExplainerVideoProps,
} from "./scenes/explainerMetadata";
import {
  sampleManifest,
  sampleMusic,
  singleSceneManifest,
} from "./scenes/fixtures/sampleManifest";
import { totalDurationInFrames } from "./schema/manifest";
import { FPS, presetNames, presets } from "./theme";
import { loadThemeFonts } from "./theme/fonts";

loadThemeFonts();

/**
 * ExplainerVideo compositions do not set duration, fps, or size here:
 * calculateExplainerMetadata derives them from the manifest and preset passed
 * as input props.
 */
export const RemotionRoot: React.FC = () => (
  <>
    {presetNames.map((preset) => (
      <Composition
        key={preset}
        id={`ExplainerVideo-${preset}`}
        component={ExplainerVideo}
        calculateMetadata={calculateExplainerMetadata}
        defaultProps={
          { manifest: sampleManifest, preset, withAudio: false } satisfies ExplainerVideoProps
        }
      />
    ))}
    <Folder name="Scenes">
      {presetNames.map((preset) =>
        sampleManifest.scenes.map((entry, i) => (
          <Composition
            key={`${preset}-${i}`}
            id={`Scene-${i + 1}-${entry.scene.type}-${preset}`}
            component={ExplainerVideo}
            calculateMetadata={calculateExplainerMetadata}
            defaultProps={
              {
                manifest: singleSceneManifest(i),
                preset,
                withAudio: false,
              } satisfies ExplainerVideoProps
            }
          />
        )),
      )}
    </Folder>
    {presetNames.flatMap((name) =>
      Object.entries(previewCodeScenes).map(([variant, { scene, filename }]) => {
        const durationInFrames = estimatePreviewFrames(scene.narration);
        return (
          <Composition
            key={`${variant}-${name}`}
            id={`CodeScene-${variant}-${name}`}
            component={CodeScene}
            durationInFrames={durationInFrames}
            fps={FPS}
            width={presets[name].width}
            height={presets[name].height}
            defaultProps={{ scene, preset: name, durationInFrames, filename }}
          />
        );
      }),
    )}
    {presetNames.map((name) => (
      <Composition
        key={`caption-${name}`}
        id={`CaptionPreview-${name}`}
        component={CaptionPreview}
        durationInFrames={CAPTION_PREVIEW_FRAMES}
        fps={FPS}
        width={presets[name].width}
        height={presets[name].height}
        defaultProps={{ preset: name }}
      />
    ))}
    {presetNames.map((name) => (
      <Composition
        key={`music-${name}`}
        id={`MusicDuckingPreview-${name}`}
        component={MusicDuckingPreview}
        durationInFrames={totalDurationInFrames(sampleManifest)}
        fps={sampleManifest.fps}
        width={presets[name].width}
        height={presets[name].height}
        defaultProps={{ manifest: sampleManifest, music: sampleMusic, preset: name }}
      />
    ))}
  </>
);
