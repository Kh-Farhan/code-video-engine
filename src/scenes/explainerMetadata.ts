import type { CalculateMetadataFunction } from "remotion";
import {
  parseManifest,
  totalDurationInFrames,
  type Manifest,
} from "../schema/manifest";
import { presetNames, presets, type PresetName } from "../theme";

export type ExplainerVideoProps = {
  manifest: Manifest;
  preset: PresetName;
  /** Play each scene's audio. Off for fixtures whose audio files do not exist. */
  withAudio?: boolean;
  /** Burn in captions from the manifest. Off for thumbnails. */
  withCaptions?: boolean;
};

/**
 * Remotion `calculateMetadata` for ExplainerVideo: duration and fps come from
 * the manifest, dimensions from the preset. Throws on an invalid manifest so
 * Studio and the renderer show the schema errors.
 */
export const calculateExplainerMetadata: CalculateMetadataFunction<
  ExplainerVideoProps
> = ({ props }) => {
  if (!presetNames.includes(props.preset)) {
    throw new Error(
      `Invalid preset "${String(props.preset)}": expected one of ${presetNames.join(", ")}`,
    );
  }
  const parsed = parseManifest(props.manifest);
  if (!parsed.success) {
    throw new Error(`Invalid manifest:\n  ${parsed.errors.join("\n  ")}`);
  }
  const manifest = parsed.data;
  const { width, height } = presets[props.preset];
  return {
    durationInFrames: totalDurationInFrames(manifest),
    fps: manifest.fps,
    width,
    height,
    props: { ...props, manifest },
    defaultOutName: `${manifest.slug}-${props.preset}`,
  };
};
