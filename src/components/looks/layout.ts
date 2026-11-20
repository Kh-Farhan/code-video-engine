import { visualZone, type Rect } from "../../captions/layout";
import type { LookName } from "../../schema/script";
import { presets, spacing, type Insets, type PresetName } from "../../theme";

/**
 * Layout of the look-specific chrome. Pure, so tests can check that nothing
 * leaves the platform safe area.
 */

/** The FG mark in the top-left corner: inside the safe area, left of the centered visual zone. */
export const wordmarkBox = (preset: PresetName): Rect =>
  preset === "short"
    ? // x 72..136 sits between the safe left inset (64) and the visual zone (144);
      // y 200 is just under the top UI band (192).
      { left: 72, top: 200, width: 60, height: 60 }
    : { left: 48, top: 22, width: 48, height: 48 };

/** Editor window title bar height, per preset. */
const TITLE_BAR: Record<PresetName, number> = { short: 76, long: 56 };
/** How far the window reaches past the visual zone on each side, per preset. */
const SIDE_REACH: Record<PresetName, number> = { short: 96, long: 72 };

export type EditorWindowLayout = {
  /** Outer box of the window. */
  window: Rect;
  titleBarHeight: number;
  /** Width of the line-number gutter left of the code, inside the window. */
  gutterWidth: number;
};

/**
 * The editor window: as tall as the visual zone and a little wider (the
 * extra width on the left holds line numbers and the FG mark), with the
 * title bar taking the top of the zone. Scene content goes below the bar
 * (see `lookVisualZone`).
 */
export const editorWindowLayout = (preset: PresetName): EditorWindowLayout => {
  const { width, height } = presets[preset];
  const zone = visualZone(preset);
  const reach = SIDE_REACH[preset];
  const left = zone.left - reach;
  return {
    window: {
      left,
      top: zone.top,
      width: width - 2 * left,
      height: height - zone.top - zone.bottom,
    },
    titleBarHeight: TITLE_BAR[preset],
    gutterWidth: reach - spacing.sm,
  };
};

/**
 * Where scene content may go for a look, as insets from the frame edges.
 * Every look uses the visual zone except `editor`, which keeps the title bar
 * and a margin at the bottom of the window clear.
 */
export const lookVisualZone = (preset: PresetName, look: LookName): Insets => {
  const zone = visualZone(preset);
  if (look !== "editor") return zone;
  const { titleBarHeight } = editorWindowLayout(preset);
  return {
    ...zone,
    top: zone.top + titleBarHeight + spacing.md,
    bottom: zone.bottom + spacing.md,
  };
};
