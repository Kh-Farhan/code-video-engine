import React from "react";
import { Composition, Series } from "remotion";
import { CAPTION_PREVIEW_FRAMES, CaptionPreview } from "./captions/CaptionPreview";
import { PlaceholderScene } from "./scenes/PlaceholderScene";
import { sceneTypes } from "./schema/script";
import { FPS, presetNames, presets, type PresetName } from "./theme";
import { loadThemeFonts } from "./theme/fonts";

loadThemeFonts();

const PLACEHOLDER_SCENE_FRAMES = FPS * 2;

const Placeholder: React.FC<{ preset: PresetName }> = ({ preset }) => (
  <Series>
    {sceneTypes.map((type) => (
      <Series.Sequence key={type} durationInFrames={PLACEHOLDER_SCENE_FRAMES}>
        <PlaceholderScene type={type} preset={preset} />
      </Series.Sequence>
    ))}
  </Series>
);

export const RemotionRoot: React.FC = () => (
  <>
    {presetNames.map((name) => (
      <Composition
        key={name}
        id={`Placeholder-${name}`}
        component={Placeholder}
        durationInFrames={PLACEHOLDER_SCENE_FRAMES * sceneTypes.length}
        fps={FPS}
        width={presets[name].width}
        height={presets[name].height}
        defaultProps={{ preset: name }}
      />
    ))}
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
  </>
);
