import React from "react";
import { Composition, Folder, Still } from "remotion";
import { CAPTION_PREVIEW_FRAMES, CaptionPreview } from "./captions/CaptionPreview";
import { MusicDuckingPreview } from "./components/MusicDuckingPreview";
import { Backdrop } from "./components/Backdrop";
import { CodeScene, type CodeSceneProps } from "./scenes/CodeScene";
import {
  estimatePreviewFrames,
  previewCodeScenes,
  previewWordTimings,
} from "./scenes/codeScenePreview";
import { ExplainerVideo } from "./scenes/ExplainerVideo";
import {
  previewVisualScenes,
  visualSceneManifest,
  type VisualPreviewName,
} from "./scenes/visualScenePreview";
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
import { captionStyleNames } from "./schema/script";
import { FPS, presetNames, presets } from "./theme";
import { loadThemeFonts } from "./theme/fonts";
import { thumbnailCompositionIds, thumbnailSizes } from "./thumbnail/compositions";
import { longHeadingThumbnailScript, sampleThumbnailScript } from "./thumbnail/fixtures";
import { thumbnailFormatNames } from "./thumbnail/layout";
import { Thumbnail, type ThumbnailProps } from "./thumbnail/Thumbnail";

loadThemeFonts();

/** CodeScene alone, over the default backdrop, as it looks inside a video. */
const CodeScenePreview: React.FC<CodeSceneProps> = (props) => (
  <>
    <Backdrop />
    <CodeScene {...props} />
  </>
);

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
    {thumbnailFormatNames.map((format) => (
      <Still
        key={`thumbnail-${format}`}
        id={thumbnailCompositionIds[format]}
        component={Thumbnail}
        {...thumbnailSizes[format]}
        defaultProps={{ script: sampleThumbnailScript } satisfies ThumbnailProps}
      />
    ))}
    <Folder name="Thumbnails">
      {thumbnailFormatNames.map((format) => (
        <Still
          key={`thumbnail-long-${format}`}
          id={`${thumbnailCompositionIds[format]}-long-heading`}
          component={Thumbnail}
          {...thumbnailSizes[format]}
          defaultProps={{ script: longHeadingThumbnailScript } satisfies ThumbnailProps}
        />
      ))}
    </Folder>
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
    <Folder name="VisualScenes">
      {presetNames.flatMap((preset) =>
        (Object.keys(previewVisualScenes) as VisualPreviewName[]).map((name) => (
          <Composition
            key={`visual-${name}-${preset}`}
            id={`VisualScene-${name}-${preset}`}
            component={ExplainerVideo}
            calculateMetadata={calculateExplainerMetadata}
            defaultProps={
              {
                manifest: visualSceneManifest(name),
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
            component={CodeScenePreview}
            durationInFrames={durationInFrames}
            fps={FPS}
            width={presets[name].width}
            height={presets[name].height}
            defaultProps={{
              scene,
              preset: name,
              durationInFrames,
              filename,
              words: previewWordTimings(scene.narration, durationInFrames),
            }}
          />
        );
      }),
    )}
    {presetNames.flatMap((name) =>
      captionStyleNames.map((variant) => (
        <Composition
          key={`caption-${variant}-${name}`}
          id={`CaptionPreview-${variant}-${name}`}
          component={CaptionPreview}
          durationInFrames={CAPTION_PREVIEW_FRAMES}
          fps={FPS}
          width={presets[name].width}
          height={presets[name].height}
          defaultProps={{ preset: name, variant }}
        />
      )),
    )}
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
