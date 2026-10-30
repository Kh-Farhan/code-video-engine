import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

const faces = [
  { family: "Inter", weight: "400", file: "inter-latin-400-normal.woff2" },
  { family: "Inter", weight: "600", file: "inter-latin-600-normal.woff2" },
  { family: "Inter", weight: "800", file: "inter-latin-800-normal.woff2" },
  { family: "JetBrains Mono", weight: "400", file: "jetbrains-mono-latin-400-normal.woff2" },
  { family: "JetBrains Mono", weight: "700", file: "jetbrains-mono-latin-700-normal.woff2" },
] as const;

/**
 * Loads the theme fonts from public/fonts (bundled, so renders work offline).
 * Import once from Root.tsx, not from Node code.
 */
export const loadThemeFonts = () =>
  Promise.all(
    faces.map(({ family, weight, file }) =>
      loadFont({ family, weight, url: staticFile(`fonts/${file}`) }),
    ),
  );
