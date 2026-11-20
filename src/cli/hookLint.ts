import type { Script } from "../schema/script";
import { codeHeadingLayout, titleHeadingLayout } from "../scenes/titleHeading";

/**
 * Checks on the first second of a Short. The layout rules (hook readable on
 * frame 0, heading fitted large, topic tag, centered block) are enforced by
 * TitleScene for every render; these warnings catch scripts whose content
 * cannot meet them.
 */

/** A hook heading smaller than this in `short` does not hit hard enough: shorten it. */
export const HOOK_MIN_FONT_SIZE = 90;

export type HookWarning = { message: string };

export const lintHook = (script: Pick<Script, "scenes">): HookWarning[] => {
  const warnings: HookWarning[] = [];
  const first = script.scenes[0];
  if (!first || first.type !== "title") {
    warnings.push({
      message: `scene 1 is ${first ? `a ${first.type} scene` : "missing"}, not a title: frame 0 of the Short shows no hook heading. Start with a title scene.`,
    });
    return warnings;
  }
  const hasTag = !!first.subheading?.trim();
  const code = codeHeadingLayout(first.heading, "short", hasTag);
  const fontSize = code?.fontSize ?? titleHeadingLayout(first.heading, "short", hasTag).fontSize;
  if (fontSize < HOOK_MIN_FONT_SIZE) {
    warnings.push({
      message: `title heading "${first.heading}" renders at ${fontSize}px in the Short (aim for ${HOOK_MIN_FONT_SIZE}px or more): shorten it${code ? " or the code in it" : ""}.`,
    });
  }
  if (!hasTag) {
    warnings.push({
      message: "title has no subheading, so the Short shows no topic tag above the hook. Add one, e.g. subheading: JavaScript.",
    });
  } else if (first.subheading!.trim().split(/\s+/).length > 4) {
    warnings.push({
      message: `title subheading "${first.subheading}" is shown as a topic tag: keep it to 1 to 4 words (e.g. JavaScript, React state).`,
    });
  }
  return warnings;
};
