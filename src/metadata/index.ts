/**
 * Upload metadata for YouTube Shorts, TikTok and Instagram Reels (plus
 * Facebook via Share to Facebook), built from a script's `meta` block with
 * fallbacks generated from its scenes, and channel settings from
 * metadata.config.json. No network calls, fully deterministic.
 */
export * from "./config";
export * from "./generate";
export * from "./platforms";
export * from "./render";
export * from "./sanitize";
