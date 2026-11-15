import { describe, expect, it } from "vitest";
import {
  BANNER_HEIGHT,
  BANNER_WIDTH,
  bannerMetrics,
  bannerSafeArea,
  channelArtCompositionIds,
  channelArtContent,
  channelArtOutputs,
  channelArtSizes,
  CHANNEL_ART_OUT_DIR,
  PROFILE_SIZE,
  profileLayout,
  profileMarks,
  profileMarkWidth,
} from "../src/channel-art";

describe("channel banner", () => {
  it("is 2560x1440 with a centered 1546x423 safe area", () => {
    expect(channelArtSizes.banner).toEqual({ width: 2560, height: 1440 });
    const { left, top, width, height } = bannerSafeArea;
    expect({ width, height }).toEqual({ width: 1546, height: 423 });
    expect(Math.abs(left - (BANNER_WIDTH - left - width))).toBeLessThanOrEqual(1);
    expect(Math.abs(top - (BANNER_HEIGHT - top - height))).toBeLessThanOrEqual(1);
  });

  it("fits every piece of text inside the safe area", () => {
    const m = bannerMetrics();
    // Small margin for kerning and rounding.
    const maxWidth = bannerSafeArea.width * 0.96;
    expect(m.nameWidth).toBeLessThan(maxWidth);
    expect(m.taglineWidth).toBeLessThan(maxWidth);
    expect(m.codeWidth).toBeLessThan(maxWidth);
    expect(m.totalHeight).toBeLessThan(bannerSafeArea.height);
  });

  it("uses no em dashes in its copy", () => {
    for (const text of Object.values(channelArtContent)) expect(text).not.toMatch(/—/);
  });
});

describe("channel profile image", () => {
  it("is 800x800 and keeps each mark well inside the circle crop", () => {
    expect(channelArtSizes.profile).toEqual({ width: 800, height: 800 });
    for (const mark of profileMarks) {
      expect(profileMarkWidth(mark)).toBeLessThan(PROFILE_SIZE * profileLayout.maxMarkWidthShare);
    }
  });

  it("stays readable at 98x98: the mark keeps a cap height of at least 26px", () => {
    // Inter cap height is about 0.73em.
    for (const mark of profileMarks) {
      const capAtSmall = profileLayout.fontSize[mark] * 0.73 * (98 / PROFILE_SIZE);
      expect(capAtSmall).toBeGreaterThanOrEqual(26);
    }
  });
});

describe("channel-art outputs", () => {
  it("renders banner, profile and a 98px preview into out/channel-art/", () => {
    expect(CHANNEL_ART_OUT_DIR).toBe("out/channel-art");
    expect(channelArtOutputs.map((o) => o.file)).toEqual(["banner.png", "profile.png", "profile-98.png"]);
    expect(channelArtOutputs.map((o) => o.id)).toEqual([
      channelArtCompositionIds.banner,
      channelArtCompositionIds.profile,
      channelArtCompositionIds.profile,
    ]);
    const preview = channelArtOutputs[2];
    expect("scale" in preview && preview.scale * PROFILE_SIZE).toBe(98);
  });
});
