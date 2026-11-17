# Code Video Engine

A pipeline that turns a short written script into a finished developer explainer video (Shorts 9:16 and long-form 16:9), built with Remotion (React). Goal: near-zero manual editing per video.

## How it works

1. Author writes `scripts/<slug>.yaml` (scenes with narration + visuals).
2. CLI validates the script, voices the whole script as one continuous narration track (trimmed, long pauses shortened), times every word (whisper alignment, else estimated inside the provider's sentence spans), derives scene timing from the words, writes a render manifest. `--per-scene-audio` keeps the old one-file-per-scene mode with padding.
3. Remotion composition reads the manifest and renders scenes in sequence with captions.
4. Output lands in `out/<slug>/` (video, thumbnail still, captions .srt).

## Stack

- Remotion (latest stable), React, TypeScript (strict)
- Zod for script/manifest schemas
- Shiki for code syntax highlighting
- pnpm
- Vitest for unit tests

Before using any Remotion API, check the current Remotion docs. Do not rely on memory for API names or signatures; versions change.

## Repo layout and ownership

Each folder is owned by one workstream so parallel sessions do not conflict. Only touch files outside your folder when the task says so.

```
src/
  schema/        Script + manifest Zod schemas and types (shared contract)
  scenes/        Scene components: TitleScene, CodeScene, TextScene, ListScene, OutroScene, CompareScene, KeywordScene, OutputScene, FlowScene, StatScene
  components/    Reusable visual pieces: CodeBlock, LineHighlight, TypingCode, Caption, ProgressBar, BackgroundMusic, Backdrop, BrandHandle
  captions/      Caption timing + SRT export
  align/         whisper.cpp word timing: transcribe, align to narration, cache, highlight cues
  tts/           TTS provider adapters (interface + implementations + mock)
  cli/           Command line entry: validate, voice, build-manifest, render, metadata
  metadata/      Template-based upload kit per platform (YouTube, TikTok, Instagram), markdown + HTML
  theme/         Colors, fonts, spacing, aspect-ratio presets
  channel-art/   YouTube channel banner (2560x1440) and profile image (800x800) stills
  Root.tsx       Composition registration
scripts/         Example video scripts (.yaml)
public/          Static assets (fonts, music, generated audio goes in public/audio/<slug>/)
out/             Render output (gitignored)
```

## Shared contract (do not change without updating all consumers)

`src/schema/script.ts` defines the script format. Scene types:

- `title`: heading, optional subheading
- `code`: language, code, optional `highlight` steps (array of line ranges shown in order, each with an optional `cue`: a narration word the step starts on), optional `typing: true`
- `text`: one or two short sentences on screen
- `list`: up to 4 short items revealed one at a time
- `outro`: call to action
- `compare`: wrong vs right, two short code blocks (`code`, with `language`) or two short `label`s; red cross side first, then green check
- `keyword`: 1 to 3 words of big kinetic text, the one idea to remember (not a sentence, not the narration)
- `output`: terminal panel, optional `command`, 1 to 6 `lines` revealed one by one
- `flow`: 2 to 4 `steps` as boxes joined by arrows, revealed in order
- `stat`: one big `value` with a small `label`, optional earlier `from` value struck through

On-screen visuals must add something the captions do not. `text` stays supported but use it rarely, only for a short on-screen phrase that differs from the narration.

Every scene has `narration` (string). Durations are never hand-written. With continuous narration (the default) a scene starts on its first spoken word and ends where the next scene's first word starts; the last scene runs 0.6s past the last word. With `--per-scene-audio` they come from each scene's audio plus padding.

A script may also set `meta` (all optional: `youtubeTitle` under 60 chars and at most 100, `thumbnail` (thumbnail and Shorts cover headline, at most 8 words; otherwise the title scene heading is used whole, or the script title if the heading does not fit), `hook`, `summary` of 1 or 2 sentences, `fixCode`, `topicTags`), which drives the upload kit; missing fields are generated from the scenes. A script may also set `style` (`look`: grid, aurora or classic; `captions`: pop or box), `brand` (`handle`), `voice` (optional voice name or ID per provider: `kokoro`, `gemini`, `elevenlabs`) and `music` (`file` relative to `public/`, optional `volume` and `duckedVolume`). The music loops under the whole video and is ducked while narration speaks.

`src/schema/manifest.ts` defines the render manifest: optional top-level `narration` (one track for the whole video, from frame 0); per scene, the audio file path (only without `narration`), duration in frames, word-level or sentence-level caption timings, and `words` (Remotion `Caption[]` in ms, `source` "aligned" from whisper.cpp or "estimated"). Optional top-level `music` holds the track path and its resolved levels, `style` the resolved look and caption style, and `brand` the handle.

## Conventions

- Functional components, named exports, no default exports except where Remotion requires them.
- All timing in frames, derived from fps in `src/theme`. Never hardcode seconds inside components.
- Animations must be deterministic (driven by the current frame only). No `Math.random`, no `Date`, no CSS transitions.
- Two presets: `short` (1080x1920) and `long` (1920x1080). Every scene must look right in both.
- Text must stay readable on a phone: minimum 48px body text in `short`.
- No em dashes in any user-facing text, captions, or generated copy.

## Secrets and network

- TTS keys come from env vars (`ELEVENLABS_API_KEY`, `GEMINI_API_KEY`). Never commit keys.
- If the environment has no network or no keys, use the `mock` TTS provider (generates silent audio of an estimated length from word count). All tests must pass with the mock provider. Whisper alignment is tested with fixture JSON in `tests/fixtures/whisper/`, never a real model.

## Commands

- `pnpm dev` : Remotion Studio preview
- `pnpm test` : Vitest
- `pnpm typecheck` : tsc --noEmit
- `pnpm video validate scripts/<slug>.yaml`
- `pnpm video voice scripts/<slug>.yaml --provider mock|kokoro|elevenlabs|gemini`
- `pnpm video render scripts/<slug>.yaml --preset short|long` (`voice` and `render` take `--align` / `--no-align` and `--per-scene-audio`)
- `pnpm video whisper-setup` : installs whisper.cpp + model into `./whisper.cpp` for caption alignment
- `pnpm video metadata scripts/<slug>.yaml` (or `--all`) : writes the upload kit `out/<slug>/upload.md` and `upload.html` (YouTube, TikTok, Instagram), using channel settings from `metadata.config.json`. `render` writes it too
- `pnpm video channel-art` : renders `out/channel-art/banner.png`, `profile.png` and a 98px `profile-98.png` preview

## Definition of done for any task

- `pnpm typecheck` and `pnpm test` pass.
- New components have a Studio composition or story-like example so they can be previewed.
- If rendering is possible in this environment, render a still frame (`remotion still`) of the new work and confirm it is not blank. If rendering is not possible (no headless browser), say so in the PR description instead of skipping silently.
- PR description lists what changed, what was not done, and how to preview it.
