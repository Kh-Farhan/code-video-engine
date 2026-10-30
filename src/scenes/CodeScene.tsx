import React from "react";
import type { CodeScene as CodeSceneData } from "../schema/script";
import { colors, fonts, presets, radius, spacing } from "../theme";
import { SceneFrame } from "./SceneFrame";
import type { SceneProps } from "./types";

/**
 * PLACEHOLDER: renders the raw code text only. The real CodeScene (Shiki
 * highlighting, highlight steps, typing) is owned by the code-scene workstream
 * and replaces this file. Keep the `SceneProps<CodeScene>` signature.
 */
export const CodeScene: React.FC<SceneProps<CodeSceneData>> = ({
  scene,
  preset,
  durationInFrames,
}) => {
  const { fontSize } = presets[preset];
  return (
    <SceneFrame preset={preset} durationInFrames={durationInFrames}>
      <pre
        style={{
          margin: 0,
          width: "100%",
          padding: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          border: `2px solid ${colors.border}`,
          fontFamily: fonts.mono,
          fontSize: fontSize.code,
          lineHeight: 1.5,
          color: colors.text,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {scene.code.replace(/\n+$/, "")}
      </pre>
    </SceneFrame>
  );
};
