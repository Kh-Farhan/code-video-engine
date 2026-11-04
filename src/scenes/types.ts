import type { TimedWord } from "../captions/types";
import type { Scene } from "../schema/script";
import type { PresetName } from "../theme";

/** Props every scene component receives. `durationInFrames` is the scene's own length. */
export type SceneProps<S extends Scene> = {
  scene: S;
  preset: PresetName;
  durationInFrames: number;
  /** Channel handle from the script's brand, if any. */
  handle?: string;
  /**
   * When each narration word is spoken, in frames from the scene start.
   * Code scenes use it to start cued highlight steps on their word.
   */
  words?: readonly TimedWord[];
};
