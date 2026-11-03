# Code Video Engine

Write a short YAML script, run one command, get a finished developer explainer video. Shorts (9:16) and long-form (16:9) come out of the same script, with narration, burned-in captions, syntax-highlighted code, a thumbnail and an `.srt` file.

Built with [Remotion](https://www.remotion.dev/), React and TypeScript.

![A code scene from the Shopify cart example, long-form preset](docs/sample-long.jpg)

<img src="docs/sample-short.jpg" alt="A typing code scene from the Next.js example, Shorts preset" width="270" />

*Stills from `scripts/shopify-storefront-cart-resets.yaml` (16:9) and `scripts/nextjs-server-vs-client-components.yaml` (9:16), rendered with the mock voice.*

## Why I built this

I like making short videos that explain one coding idea at a time. The part I don't like is the editing. Lining up code on screen with what I'm saying, nudging captions so they match the voice, re-exporting everything because I changed one sentence. A 60 second clip could eat a whole evening.

So I flipped it around. The script is the source of truth. I write what I want to say and what should be on screen, and the tool works out the timing from the generated voice. If I change a line, I run the command again and the video, captions and thumbnail all update together. No timeline, no dragging clips around.

It also keeps every video looking consistent, which is hard to do by hand. Same fonts, same colors, same pacing, and it looks right on a phone and on a desktop without me thinking about it.

## Quick start

You need Node 20.19+ (or 22.13+) and pnpm.

```bash
pnpm install
```

```bash
pnpm video render scripts/nextjs-server-vs-client-components.yaml --preset short
```

That validates the script, generates narration with the offline `mock` voice (silent audio timed from the word count), builds the manifest, and renders. Look in `out/nextjs-server-vs-client-components/`.

For a real voice with no account, no key and no limits, use **Kokoro**, a free open source voice model that runs on your own computer:

```bash
pnpm video render scripts/nextjs-server-vs-client-components.yaml --provider kokoro
```

The first run downloads the model once (about 90 MB, from Hugging Face). After that it works offline. Each scene takes a few seconds to voice on a laptop, and the audio is cached, so re-renders are instant.

You can also use a cloud voice with an API key:

1. Copy the example env file in the repo root: `cp .env.example .env`
2. Open `.env` and paste your key after the `=`, for example `GEMINI_API_KEY=AIza...` (no quotes, no spaces). Gemini keys come from https://aistudio.google.com/apikey.
3. Render with that provider, for example `--provider gemini`.

`.env` is gitignored, so the key never gets committed. A key exported in your shell works too and takes priority over `.env`. Free cloud tiers have tight limits (Gemini's free tier allows a few requests a minute and a small daily quota), which is why Kokoro is the easier default.

## Testing it locally

Everything below works offline with no API keys.

```bash
nvm use            # Node 22, from .nvmrc (any Node 20.19+ works)
corepack enable    # gives you the pnpm version pinned in package.json
pnpm install
```

```bash
pnpm typecheck && pnpm test
```

```bash
pnpm video validate scripts/shopify-storefront-cart-resets.yaml
```

```bash
pnpm dev
```

`pnpm dev` opens Remotion Studio at http://localhost:3000 with the full example video, each scene on its own, the caption preview and the music ducking preview.

The first `render` downloads a headless Chrome for Remotion (about 100 MB). If that is blocked on your machine, pass `--browser-executable` with the path to a local Chrome or Chromium.

To try background music, put any track at `public/music/test.mp3`, add `music: { file: music/test.mp3 }` under the `title` of a script, and render it.

## Script format

A script is a title, an optional music track, and a list of scenes. Every scene has `narration`, which is what the voice says. You never write durations: each scene lasts as long as its narration plus a short pause.

```yaml
title: Why your Shopify Storefront API cart keeps resetting

# Optional. Narration voice per provider; each one names voices its own way.
voice:
  gemini: Puck                       # a Gemini prebuilt voice name
  elevenlabs: 21m00Tcm4TlvDq8ikWAM   # an ElevenLabs voice ID

# Optional. Loops under the whole video and gets quieter while narration plays.
music:
  file: music/lofi.mp3     # relative to public/
  volume: 0.3              # optional, level in pauses (0 to 1, default 0.3)
  duckedVolume: 0.08       # optional, level under narration (default 0.08)

scenes:
  - type: title
    heading: Why your Shopify cart keeps resetting
    subheading: A Storefront API bug and the fix      # optional
    narration: You add a product, refresh, and the cart is empty again.

  - type: text
    text: An empty cart on every refresh usually means a new cart on every refresh.
    narration: Nine times out of ten, you are creating a brand new cart on every load.

  - type: code
    language: typescript
    typing: true            # optional, types the code out character by character
    code: |
      async function getCart(cookies) {
        const id = cookies.get("cartId");
        if (id) return fetchCart(id);
        return cartCreate();
      }
    highlight:              # optional, line ranges focused one after another
      - { from: 2, to: 2 }
      - { from: 3, to: 4 }
    narration: Read the cart ID from a cookie, and only create a cart when there is none.

  - type: list
    items:                  # up to 4, revealed one at a time
      - Keeping the cart ID only in React state
      - Ignoring a null cart after checkout
    narration: Watch for these two as well.

  - type: outro
    cta: Create the cart once, then reuse its ID
    narration: Follow for more Shopify developer tips.
```

| Scene    | Fields                                                                 |
| -------- | ---------------------------------------------------------------------- |
| `title`  | `heading` (80 chars), `subheading` (optional, 120 chars)               |
| `text`   | `text`: one or two short sentences (160 chars)                         |
| `code`   | `language`, `code`, `highlight` (optional), `typing` (optional)        |
| `list`   | `items`: 1 to 4 items, 60 chars each                                   |
| `outro`  | `cta`: the call to action (80 chars)                                   |

Supported code languages: `typescript`, `tsx`, `javascript`, `jsx`, `json`, `css`, `html`, `bash`, `python`, `go`, `rust`, `sql`, `yaml`.

A few rules the validator enforces, so mistakes show up before you spend time rendering:

- The file name is the slug and must be kebab-case, like `scripts/use-memo-tips.yaml`.
- Unknown fields are errors, so a typo like `hightlight` does not get silently ignored.
- Highlight ranges must point at lines that exist.
- No em dashes in on-screen text or narration. Use a comma, colon or period.
- If you set `music.file`, it has to exist under `public/`.

There are three full examples in `scripts/`:

- `example-usememo.yaml`: When NOT to use useMemo
- `nextjs-server-vs-client-components.yaml`: Server vs Client Components in Next.js App Router in 60 seconds
- `shopify-storefront-cart-resets.yaml`: Why your Shopify Storefront API cart keeps resetting

## Look and feel

Set these at the top of a script. Everything is optional.

```yaml
style:
  look: grid        # grid (default), aurora or classic
  captions: pop     # pop (default) or box
brand:
  handle: "@yourchannel"
```

- **Looks.** `grid` is a floor grid rolling toward the viewer under a glowing horizon, with drifting light and floating particles. `aurora` is soft blue, purple and teal light drifting behind everything. `classic` is the original static navy. The background is drawn once behind the whole video, so its motion carries straight through scene changes.
- **Captions.** `pop` shows big outlined words two to four at a time, and the word being spoken pops in yellow: the usual Shorts and Reels style. `box` is a calmer subtitle box with up to six words.
- **Brand.** With a `handle`, a small pill shows it at the top of the video (top center on vertical video, clear of the buttons Shorts, Reels and Facebook draw in the corners) and the outro adds "Follow @yourchannel".
- **Motion.** Titles and calls to action come in word by word, and scenes change with a quick zoom and blur instead of a plain fade.

In Studio, the `CaptionPreview-pop-*` and `CaptionPreview-box-*` compositions show each caption style.

## Background music

Drop a track into `public/music/` and point `music.file` at it. The music:

- loops if it is shorter than the video,
- fades in over the first second and out over the last 1.5 seconds,
- ducks to `duckedVolume` while anyone is talking and comes back up to `volume` in pauses longer than a second, so it does not pump up and down between scenes.

The ducking is computed from the caption timings, so it follows the real narration with no extra setup. Open `MusicDuckingPreview` in Studio to see the volume curve against the narration.

`public/music/demo-pad.mp3` is a calm 65 second chord loop generated for this repo, so you can try music right away (the Next.js example uses it). Replace it with any track you have the rights to. If the music is hard to hear under the voice, raise `duckedVolume` a little, for example to `0.12`.

## Voices

Each provider has a default voice (Kokoro uses `af_heart`, Gemini uses `Kore`). To change it, add a `voice` entry for your provider to the script, as in the example above, or try one for a single run without editing anything:

```bash
pnpm video voice scripts/nextjs-server-vs-client-components.yaml --provider kokoro --voice am_michael
```

To change how fast it talks, add `speed` under `voice` (from 0.5 to 2, where 1 is normal and 1.15 sounds brisk), or pass `--speed 1.15` for one run. `--voice` and `--speed` win over the script. Audio is cached per voice and speed, so switching back to a combination you already used is instant.

| Provider | Voices |
| -------- | ------ |
| `kokoro` | American: `af_heart`, `af_bella`, `af_nicole`, `af_sarah`, `af_sky`, `am_michael`, `am_fenrir`, `am_puck`, `am_adam` and more. British: `bf_emma`, `bf_isabella`, `bm_george`, `bm_fable`, `bm_lewis`, `bm_daniel`. The second letter is `f` for female, `m` for male. An unknown name lists all 28. |
| `gemini` | `Kore`, `Puck`, `Charon`, `Fenrir`, `Aoede`, `Leda`, `Orus`, `Zephyr` and more; the speech generation page of the Gemini docs has samples. |
| `elevenlabs` | Voice IDs from your ElevenLabs voice library. |

## Commands

| Command | What it does |
| ------- | ------------ |
| `pnpm video validate scripts/<slug>.yaml` | Checks the script and lists every problem with its location |
| `pnpm video voice scripts/<slug>.yaml --provider mock\|kokoro\|elevenlabs\|gemini [--voice <name>]` | Generates narration per scene into `public/audio/<slug>/` (cached, so unchanged scenes are free) |
| `pnpm video build-manifest scripts/<slug>.yaml` | Measures the audio and writes `out/<slug>/manifest.json` |
| `pnpm video render scripts/<slug>.yaml --preset short\|long` | All of the above, then renders the video, thumbnail and captions |
| `pnpm dev` | Remotion Studio, with previews of every scene, the captions and the music ducking |
| `pnpm test` | Unit tests (Vitest), all offline with the mock voice |
| `pnpm typecheck` | `tsc --noEmit` |

`render` options:

- `--preset short` (1080x1920, the default) or `--preset long` (1920x1080)
- `--provider mock` (default, silent audio for testing), `kokoro` (free, local), `elevenlabs` or `gemini`
- `--voice <name>` to use a different voice for this run
- `--browser-executable <path>` if Remotion cannot download Chrome on your machine (also read from `REMOTION_BROWSER_EXECUTABLE`)

API keys come from `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`, read from your shell or from `.env` in the repo root (see `.env.example`). Kokoro and mock need no key.

## Output

```
out/<slug>/
  <slug>-short.mp4              the video
  <slug>-short-thumbnail.png    a still of the title scene
  <slug>.srt                    captions, chunked the same way as on screen
  manifest.json                 per-scene audio, duration and caption timings
```

## How it works

1. `validate` parses the YAML and checks it against the Zod schema in `src/schema/script.ts`.
2. `voice` turns each scene's narration into audio with the chosen TTS provider.
3. `build-manifest` measures every audio file, adds a short pause after each scene, spreads word timings across the speech for captions, and writes the manifest (`src/schema/manifest.ts`).
4. `render` hands the manifest to the Remotion composition in `src/scenes/ExplainerVideo.tsx`, which plays the scenes in order with their audio, captions, a progress bar and the background music.

Everything on screen is driven by the frame number only, so renders are repeatable.

```
src/
  schema/      script and manifest schemas
  scenes/      Title, Code, Text, List and Outro scenes
  components/  CodeBlock, TypingCode, LineHighlight, Caption, ProgressBar, BackgroundMusic
  captions/    caption timing and SRT export
  tts/         mock, Kokoro, ElevenLabs and Gemini voices
  cli/         the `pnpm video` commands
  theme/       colors, fonts, spacing, timing and the two presets
```
