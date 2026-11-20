import React, { createContext, useContext } from "react";
import type { LookName } from "../../schema/script";
import { DEFAULT_LOOK, type Insets, type PresetName } from "../../theme";
import { lookVisualZone } from "./layout";

const LookContext = createContext<LookName>(DEFAULT_LOOK);

/** Tells every scene below which look the video uses. */
export const LookProvider: React.FC<{ look: LookName; children: React.ReactNode }> = ({
  look,
  children,
}) => <LookContext.Provider value={look}>{children}</LookContext.Provider>;

/** The current look (the default outside a LookProvider). */
export const useLook = (): LookName => useContext(LookContext);

/** The visual zone for the current look, as insets from the frame edges. */
export const useVisualZone = (preset: PresetName): Insets => lookVisualZone(preset, useLook());
