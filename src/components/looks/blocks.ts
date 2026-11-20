import type { SceneMood } from "../../schema/script";
import { lookColors } from "../../theme";

/** One flat color of the `blocks` look and the frame it wipes in on. */
export type BlockStep = { frame: number; color: string };

/**
 * The `blocks` color sequence: one color per mood change (every scene start,
 * plus the fix moment inside a compare scene). Bug and fix moments take their
 * brand shade; calm scenes cycle through the accent shades. Two neighbours
 * never share a color, so every scene change shows a wipe.
 */
export const blockSteps = (changes: readonly { frame: number; mood: SceneMood }[]): BlockStep[] => {
  const steps: BlockStep[] = [];
  let calm = 0;
  for (const { frame, mood } of changes) {
    const palette: readonly string[] = lookColors.blocks[mood];
    let color = palette[(mood === "accent" ? calm++ : 0) % palette.length] ?? lookColors.blocks.accent[0];
    const previous = steps[steps.length - 1]?.color;
    if (color === previous) {
      const all = [...lookColors.blocks.accent, ...lookColors.blocks.bug, ...lookColors.blocks.fix];
      color = all.find((c) => c !== previous) ?? color;
    }
    // A change on the same frame replaces the one before it.
    if (steps.length > 0 && steps[steps.length - 1]?.frame === frame) steps.pop();
    steps.push({ frame, color });
  }
  return steps.length > 0 ? steps : [{ frame: 0, color: lookColors.blocks.accent[0] }];
};
