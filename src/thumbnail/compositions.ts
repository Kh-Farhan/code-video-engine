import { thumbnailFormats, type ThumbnailFormatName } from "./layout";

/** Still composition ids, shared by Root.tsx and the CLI. */
export const thumbnailCompositionIds: Record<ThumbnailFormatName, string> = {
  landscape: "Thumbnail",
  cover: "ShortsCover",
};

export const thumbnailSizes = Object.fromEntries(
  Object.values(thumbnailFormats).map((f) => [f.name, { width: f.width, height: f.height }]),
) as Record<ThumbnailFormatName, { width: number; height: number }>;
