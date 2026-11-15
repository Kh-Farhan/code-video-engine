import { BANNER_HEIGHT, BANNER_WIDTH, PROFILE_SIZE, PROFILE_SMALL_SIZE } from "./layout";

/** Still composition ids, shared by Root.tsx and the CLI. */
export const channelArtCompositionIds = {
  banner: "ChannelBanner",
  profile: "ChannelProfile",
} as const;

export const channelArtSizes = {
  banner: { width: BANNER_WIDTH, height: BANNER_HEIGHT },
  profile: { width: PROFILE_SIZE, height: PROFILE_SIZE },
} as const;

export const CHANNEL_ART_OUT_DIR = "out/channel-art";

/** What `pnpm video channel-art` renders. `scale` shrinks the still (Remotion --scale). */
export const channelArtOutputs = [
  { label: "Render banner (2560x1440)", id: channelArtCompositionIds.banner, file: "banner.png" },
  { label: "Render profile image (800x800)", id: channelArtCompositionIds.profile, file: "profile.png" },
  {
    label: `Render profile preview (${PROFILE_SMALL_SIZE}x${PROFILE_SMALL_SIZE})`,
    id: channelArtCompositionIds.profile,
    file: `profile-${PROFILE_SMALL_SIZE}.png`,
    scale: PROFILE_SMALL_SIZE / PROFILE_SIZE,
  },
] as const;
