import React, { useEffect, useState } from "react";
import { AbsoluteFill, useDelayRender } from "remotion";
import { Backdrop } from "../components/Backdrop";
import type { CodeToken } from "../components/codeLayout";
import { tokenizeCode } from "../components/highlighter";
import { colors, fonts, radius } from "../theme";
import { bannerLayout, bannerSafeArea, channelArtContent } from "./layout";

export type ChannelBannerProps = {
  /** Draws the 1546x423 safe area outline, for checking the layout in Studio. */
  debugSafeArea?: boolean;
};

/**
 * 2560x1440 YouTube channel banner. Every piece of text sits inside the
 * centered safe area, which is all a phone shows; the rest is backdrop.
 */
export const ChannelBanner: React.FC<ChannelBannerProps> = ({ debugSafeArea = false }) => {
  const { name, tagline } = bannerLayout;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, overflow: "hidden" }}>
      <Backdrop look="grid" />
      {/* Soft dark band behind the safe area so the text reads over the grid. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 45% 32% at 50% 50%, rgba(11, 15, 23, 0.85) 0%, rgba(11, 15, 23, 0.4) 60%, rgba(11, 15, 23, 0) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          ...bannerSafeArea,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          outline: debugSafeArea ? `4px dashed ${colors.danger}` : undefined,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: fonts.sans,
            fontWeight: 800,
            fontSize: name.fontSize,
            lineHeight: name.lineHeight,
            letterSpacing: `${name.letterSpacingEm}em`,
            color: colors.text,
            whiteSpace: "nowrap",
            textShadow: "0 6px 28px rgba(0, 0, 0, 0.6)",
          }}
        >
          Frontend <span style={{ color: colors.captionHighlight }}>Gotchas</span>
        </h1>
        <div
          style={{
            marginTop: bannerLayout.gapNameTagline,
            fontFamily: fonts.sans,
            fontWeight: 600,
            fontSize: tagline.fontSize,
            lineHeight: tagline.lineHeight,
            color: colors.textMuted,
            whiteSpace: "nowrap",
          }}
        >
          {channelArtContent.tagline}
        </div>
        <div style={{ marginTop: bannerLayout.gapTaglineCode }}>
          <CodePill />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Shiki tokens for the banner snippet, holding the render until they are ready. */
const useCodeTokens = (code: string): CodeToken[] | undefined => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Highlighting channel banner code"));
  const [tokens, setTokens] = useState<CodeToken[]>();
  useEffect(() => {
    let active = true;
    tokenizeCode(code, channelArtContent.codeLanguage)
      .then((lines) => {
        if (active) setTokens(lines[0] ?? []);
        continueRender(handle);
      })
      .catch((err: unknown) => cancelRender(err));
    return () => {
      active = false;
    };
  }, [code, handle, continueRender, cancelRender]);
  return tokens;
};

/** One line of highlighted code in a small editor-style card. */
const CodePill: React.FC = () => {
  const { code } = bannerLayout;
  const tokens = useCodeTokens(channelArtContent.code) ?? [{ content: channelArtContent.code }];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: code.padX,
        padding: `${code.padY}px ${code.padX}px`,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        border: `2px solid ${colors.border}`,
        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(122, 162, 247, 0.18)",
      }}
    >
      <div style={{ display: "flex", gap: code.dotGap }}>
        {[colors.danger, colors.warning, colors.success].map((c) => (
          <div key={c} style={{ width: code.dot, height: code.dot, borderRadius: "50%", backgroundColor: c }} />
        ))}
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: code.fontSize,
          lineHeight: code.lineHeight,
          whiteSpace: "pre",
          fontVariantLigatures: "none",
        }}
      >
        {tokens.map((t, i) => (
          <span key={i} style={{ color: t.color ?? colors.text }}>
            {t.content}
          </span>
        ))}
      </div>
    </div>
  );
};
