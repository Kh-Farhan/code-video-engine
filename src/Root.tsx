import React from "react";
import { Composition, Folder } from "remotion";
import { ExplainerVideo } from "./scenes/ExplainerVideo";
import {
  calculateExplainerMetadata,
  type ExplainerVideoProps,
} from "./scenes/explainerMetadata";
import {
  sampleManifest,
  singleSceneManifest,
} from "./scenes/fixtures/sampleManifest";
import { presetNames } from "./theme";
import { loadThemeFonts } from "./theme/fonts";

loadThemeFonts();

/**
 * Duration, fps, and size are not set here: calculateExplainerMetadata derives
 * them from the manifest and preset passed as input props.
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
            id={`Scene-${entry.scene.type}-${preset}`}
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
  </>
);
