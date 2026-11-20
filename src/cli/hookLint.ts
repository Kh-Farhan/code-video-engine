import { splitWords } from "../captions/text";
import type { Manifest } from "../schema/manifest";
import { splitAtPauseMarkers, stripPauseMarkers } from "../schema/pauses";
import type { Script } from "../schema/script";
import { codeHeadingLayout, titleHeadingLayout } from "../scenes/titleHeading";
import { countWords, MOCK_WORDS_PER_MINUTE } from "../tts/mock";
import { defaultPauses } from "../tts/pauses";

/**
 * Checks on the first second of a Short. The layout rules (hook readable on
 * frame 0, heading fitted large, topic tag, centered block) are enforced by
 * TitleScene for every render; these warnings catch scripts whose content
 * cannot meet them.
 */

/** A hook heading smaller than this in `short` does not hit hard enough: shorten it. */
export const HOOK_MIN_FONT_SIZE = 90;

/** Viewers decide in the first 1 to 2 seconds: the title narration must be over by then. */
export const TITLE_MAX_NARRATION_SECONDS = 2.2;
/** Longest text heading (code headings are exempt). Punctuation-only tokens ("+", "===") do not count. */
export const TITLE_MAX_HEADING_WORDS = 6;

export type HookWarning = { message: string };

/** Words in a heading, not counting tokens with no letter or digit. */
export const headingWordCount = (heading: string): number =>
  heading.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/**
 * Estimated length of the title narration: its words at the mock pace
 * (MOCK_WORDS_PER_MINUTE times the script's voice.speed), plus any
 * [pause] markers.
 */
export const estimateTitleSeconds = (
  narration: string,
  speed = 1,
  markerMs: number = defaultPauses.markerMs,
): number => {
  const words = countWords(stripPauseMarkers(narration));
  const pausesMs = splitAtPauseMarkers(narration, markerMs).reduce((sum, p) => sum + (p.pauseAfterMs ?? 0), 0);
  return (words / (MOCK_WORDS_PER_MINUTE * speed)) * 60 + pausesMs / 1000;
};

/**
 * Real spoken length of the title narration from a voiced manifest: the end
 * of its last word (scene 1 starts at frame 0). Undefined when the manifest
 * has no word timings or was voiced from a different title narration.
 */
export const measuredTitleSeconds = (
  script: Pick<Script, "scenes">,
  manifest: Pick<Manifest, "scenes">,
): number | undefined => {
  const first = script.scenes[0];
  const words = manifest.scenes[0]?.words?.captions;
  if (!first || !words || words.length === 0 || manifest.scenes.length !== script.scenes.length) return undefined;
  if (words.length !== splitWords(stripPauseMarkers(first.narration)).length) return undefined;
  return Math.max(...words.map((w) => w.endMs)) / 1000;
};

export type HookLintOptions = {
  /** Real title narration length in seconds, when audio exists. Otherwise it is estimated. */
  titleSeconds?: number;
};

export const lintHook = (
  script: Pick<Script, "scenes"> & Partial<Pick<Script, "voice" | "style">>,
  options: HookLintOptions = {},
): HookWarning[] => {
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
  if (!code) {
    const words = headingWordCount(first.heading);
    if (words > TITLE_MAX_HEADING_WORDS) {
      warnings.push({
        message: `title heading "${first.heading}" is ${words} words: keep it to ${TITLE_MAX_HEADING_WORDS} or fewer, keeping the concrete symptom.`,
      });
    }
  }
  const measured = options.titleSeconds;
  const seconds =
    measured ?? estimateTitleSeconds(first.narration, script.voice?.speed ?? 1, script.style?.pauses?.markerMs);
  if (seconds > TITLE_MAX_NARRATION_SECONDS) {
    warnings.push({
      message: `title narration runs ${seconds.toFixed(1)}s (${measured === undefined ? "estimated from word count" : "measured from the audio"}): keep it to ${TITLE_MAX_NARRATION_SECONDS}s or less, one short line. Move the rest of the setup into scene 2's narration.`,
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
