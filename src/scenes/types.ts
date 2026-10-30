import type { Scene } from "../schema/script";
import type { PresetName } from "../theme";

/** Props every scene component receives. `durationInFrames` is the scene's own length. */
export type SceneProps<S extends Scene> = {
  scene: S;
  preset: PresetName;
  durationInFrames: number;
};
