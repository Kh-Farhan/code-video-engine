import type { Script } from "../schema/script";
import { sampleManifest } from "../scenes/fixtures/sampleManifest";

/** Studio preview scripts for the thumbnail stills. */
export const sampleThumbnailScript: Script = {
  title: "When NOT to use useMemo",
  brand: { handle: "@yourchannel" },
  scenes: sampleManifest.scenes.map((s) => s.scene),
};

/** A long heading and subheading, to preview shortening and auto-sizing. */
export const longHeadingThumbnailScript: Script = {
  title: "Why your Shopify cart keeps resetting",
  style: { look: "aurora" },
  scenes: [
    {
      type: "title",
      heading: "Why your Shopify Storefront API cart keeps resetting after every single page load",
      subheading: "A Storefront API bug, the cookie that causes it, and the two line fix",
      narration: "Your cart empties on every page load. Here is why.",
    },
    {
      type: "code",
      language: "typescript",
      code: [
        "export async function getCart(cookies: Cookies) {",
        "  const id = cookies.get(\"cartId\");",
        "  if (!id) return createCart(cookies);",
        "  const cart = await storefront.query(CART_QUERY, { id });",
        "  return cart ?? createCart(cookies);",
        "}",
      ].join("\n"),
      highlight: [{ from: 2, to: 3 }],
      narration: "Read the id from the cookie first.",
    },
  ],
};
