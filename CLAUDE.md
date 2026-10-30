# Code Video Engine

A pipeline that turns a short written script into a finished developer explainer video (Shorts 9:16 and long-form 16:9), built with Remotion (React). Goal: near-zero manual editing per video.

## How it works

1. Author writes `scripts/<slug>.yaml` (scenes with narration + visuals).
2. CLI validates the script, generates TTS audio per scene, measures durations, writes a render manifest.
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
  scenes/        Scene components: TitleScene, CodeScene, TextScene, ListScene, OutroScene
  components/    Reusable visual pieces: CodeBlock, LineHighlight, TypingCode, Caption, ProgressBar
  captions/      Caption timing + SRT export
  tts/           TTS provider adapters (interface + implementations + mock)
  cli/           Command line entry: validate, voice, build-manifest, render
  theme/         Colors, fonts, spacing, aspect-ratio presets
  Root.tsx       Composition registration
scripts/         Example video scripts (.yaml)
public/          Static assets (fonts, music, generated audio goes in public/audio/<slug>/)
out/             Render output (gitignored)
```

## Shared contract (do not change without updating all consumers)

`src/schema/script.ts` defines the script format. Scene types:

- `title`: heading, optional subheading
- `code`: language, code, optional `highlight` steps (array of line ranges shown in order), optional `typing: true`
- `text`: one or two short sentences on screen
- `list`: up to 4 short items revealed one at a time
- `outro`: call to action

Every scene has `narration` (string). Durations are never hand-written; they come from the generated audio plus padding.

`src/schema/manifest.ts` defines the render manifest: per scene, the audio file path, duration in frames, and word-level or sentence-level caption timings.

## Conventions

- Functional components, named exports, no default exports except where Remotion requires them.
- All timing in frames, derived from fps in `src/theme`. Never hardcode seconds inside components.
- Animations must be deterministic (driven by the current frame only). No `Math.random`, no `Date`, no CSS transitions.
- Two presets: `short` (1080x1920) and `long` (1920x1080). Every scene must look right in both.
- Text must stay readable on a phone: minimum 48px body text in `short`.
- No em dashes in any user-facing text, captions, or generated copy.

## Secrets and network

- TTS keys come from env vars (`ELEVENLABS_API_KEY`, `GEMINI_API_KEY`). Never commit keys.
- If the environment has no network or no keys, use the `mock` TTS provider (generates silent audio of an estimated length from word count). All tests must pass with the mock provider.

## Commands

- `pnpm dev` : Remotion Studio preview
- `pnpm test` : Vitest
- `pnpm typecheck` : tsc --noEmit
- `pnpm video validate scripts/<slug>.yaml`
- `pnpm video voice scripts/<slug>.yaml --provider mock|elevenlabs|gemini`
- `pnpm video render scripts/<slug>.yaml --preset short|long`

## Definition of done for any task

- `pnpm typecheck` and `pnpm test` pass.
- New components have a Studio composition or story-like example so they can be previewed.
- If rendering is possible in this environment, render a still frame (`remotion still`) of the new work and confirm it is not blank. If rendering is not possible (no headless browser), say so in the PR description instead of skipping silently.
- PR description lists what changed, what was not done, and how to preview it.
