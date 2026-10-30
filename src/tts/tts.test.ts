import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  audioDirForSlug,
  audioDurationFromBytes,
  toPublicPath,
  createTtsProvider,
  estimateSpeechSeconds,
  measureAudioDuration,
  TtsError,
  withCache,
  type TtsBackend,
} from "./index";
import { createMockBackend } from "./mock";
import { pacingHint } from "./gemini";
import { silentWav, wrapPcmAsWav } from "./wav";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tts-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("mock provider", () => {
  it("estimates about 150 words per minute", () => {
    expect(estimateSpeechSeconds(words(150))).toBe(60);
    expect(estimateSpeechSeconds(words(25))).toBe(10);
    expect(estimateSpeechSeconds(words(25), 2)).toBe(5);
    expect(estimateSpeechSeconds("Hi")).toBe(0.5);
  });

  it("writes a silent WAV whose measured duration matches the estimate", async () => {
    const tts = createTtsProvider("mock", { cacheDir: dir });
    const result = await tts.synthesize(words(30));
    expect(result.path.startsWith(dir)).toBe(true);
    expect(result.path.endsWith(".wav")).toBe(true);
    expect(result.cached).toBe(false);
    expect(result.durationSeconds).toBeCloseTo(12, 3);
    expect(await measureAudioDuration(result.path)).toBeCloseTo(12, 3);
  });

  it("applies speaking rate", async () => {
    const tts = createTtsProvider("mock", { cacheDir: dir });
    const fast = await tts.synthesize(words(30), { speakingRate: 1.5 });
    expect(fast.durationSeconds).toBeCloseTo(8, 3);
  });

  it("rejects empty text and bad rates", async () => {
    const tts = createTtsProvider("mock", { cacheDir: dir });
    await expect(tts.synthesize("   ")).rejects.toThrow(TtsError);
    await expect(tts.synthesize("hi", { speakingRate: 0 })).rejects.toThrow(/speakingRate/);
  });
});

describe("cache", () => {
  const counting = () => {
    const backend = createMockBackend();
    const generate = vi.fn(backend.generate);
    return { backend: { ...backend, generate } satisfies TtsBackend, generate };
  };

  it("reuses the file for the same text, voice and provider", async () => {
    const { backend, generate } = counting();
    const tts = withCache(backend, dir);
    const a = await tts.synthesize("Hello there, world.");
    const b = await tts.synthesize("  Hello there, world.  ");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(b.path).toBe(a.path);
    expect(b.cached).toBe(true);
    expect(b.durationSeconds).toBe(a.durationSeconds);
  });

  it("survives a new provider instance (cache is on disk)", async () => {
    await withCache(createMockBackend(), dir).synthesize("Persisted line.");
    const { backend, generate } = counting();
    const result = await withCache(backend, dir).synthesize("Persisted line.");
    expect(generate).not.toHaveBeenCalled();
    expect(result.cached).toBe(true);
  });

  it("generates again when text, voice or rate changes", async () => {
    const { backend, generate } = counting();
    const tts = withCache(backend, dir);
    const paths = new Set([
      (await tts.synthesize("One")).path,
      (await tts.synthesize("Two")).path,
      (await tts.synthesize("One", { voiceId: "other" })).path,
      (await tts.synthesize("One", { speakingRate: 1.2 })).path,
    ]);
    expect(paths.size).toBe(4);
    expect(generate).toHaveBeenCalledTimes(4);
  });

  it("does not share files between providers", async () => {
    const mock = withCache(createMockBackend(), dir);
    const other = withCache({ ...createMockBackend(), name: "gemini" }, dir);
    const a = await mock.synthesize("Same text", { voiceId: "v" });
    const b = await other.synthesize("Same text", { voiceId: "v" });
    expect(a.path).not.toBe(b.path);
  });

  it("dedupes concurrent requests for the same key", async () => {
    const { backend, generate } = counting();
    const tts = withCache(backend, dir);
    const results = await Promise.all([
      tts.synthesize("Once"),
      tts.synthesize("Once"),
      tts.synthesize("Once"),
    ]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(results.every((r) => !r.cached)).toBe(true);
  });

  it("maps cache paths to public/-relative paths for the manifest", async () => {
    const publicDir = join(dir, "public");
    const tts = createTtsProvider("mock", { cacheDir: audioDirForSlug("my-video", publicDir) });
    const { path } = await tts.synthesize("Hello");
    expect(toPublicPath(path, publicDir)).toMatch(/^audio\/my-video\/mock-[0-9a-f]{32}\.wav$/);
    expect(() => toPublicPath(join(dir, "elsewhere.wav"), publicDir)).toThrow(/not inside/);
  });

  it("does not write a file when generation fails", async () => {
    const failing: TtsBackend = {
      ...createMockBackend(),
      generate: async () => {
        throw new TtsError("boom");
      },
    };
    await expect(withCache(failing, dir).synthesize("x")).rejects.toThrow("boom");
    const ok = await withCache(createMockBackend(), dir).synthesize("x");
    expect(ok.cached).toBe(false);
  });
});

describe("duration measurement", () => {
  it("reads WAV duration from the header", () => {
    expect(audioDurationFromBytes(silentWav(2.5, 8000))).toBeCloseTo(2.5, 6);
    const stereo = wrapPcmAsWav(new Uint8Array(24000 * 4), {
      sampleRate: 24000,
      channels: 2,
      bitsPerSample: 16,
    });
    expect(audioDurationFromBytes(stereo)).toBeCloseTo(1, 6);
  });

  // MPEG-1 Layer III, 128 kbps, 44.1 kHz, no padding, stereo: 417 bytes, 1152 samples.
  const mp3Frame = () => {
    const f = new Uint8Array(417);
    f.set([0xff, 0xfb, 0x90, 0x00]);
    return f;
  };
  const concat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.byteLength;
    }
    return out;
  };

  it("sums CBR MP3 frames, skipping an ID3v2 tag", () => {
    const frames = Array.from({ length: 100 }, mp3Frame);
    const id3 = new Uint8Array(10 + 20);
    id3.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20]);
    const seconds = audioDurationFromBytes(concat(id3, ...frames));
    expect(seconds).toBeCloseTo((100 * 1152) / 44100, 6);
  });

  it("uses the Xing frame count for VBR MP3", () => {
    const xing = mp3Frame();
    const v = new DataView(xing.buffer);
    xing.set([0x58, 0x69, 0x6e, 0x67], 4 + 32); // "Xing" after stereo side info
    v.setUint32(4 + 32 + 4, 1); // frames flag
    v.setUint32(4 + 32 + 8, 500);
    const seconds = audioDurationFromBytes(concat(xing, mp3Frame(), mp3Frame()));
    expect(seconds).toBeCloseTo((500 * 1152) / 44100, 6);
  });

  it("fails clearly on unknown formats", async () => {
    expect(() => audioDurationFromBytes(new Uint8Array(64))).toThrow(/not a WAV or MP3/);
  });
});

describe("real providers without network", () => {
  const audioResponse = (bytes: Uint8Array) =>
    new Response(Buffer.from(bytes), { status: 200, headers: { "content-type": "audio/mpeg" } });

  it("fail with a clear message when the key is missing", async () => {
    const fetch = vi.fn();
    const eleven = createTtsProvider("elevenlabs", { cacheDir: dir, env: {}, fetch });
    await expect(eleven.synthesize("Hi")).rejects.toThrow(/ELEVENLABS_API_KEY is not set/);
    const gemini = createTtsProvider("gemini", { cacheDir: dir, env: {}, fetch });
    await expect(gemini.synthesize("Hi")).rejects.toThrow(/GEMINI_API_KEY is not set/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unknown provider names", () => {
    expect(() => createTtsProvider("polly")).toThrow(/Unknown TTS provider "polly"/);
  });

  it("elevenlabs sends the documented request and caches the mp3", async () => {
    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0x00]);
    const fetch = vi.fn(async () => audioResponse(frame));
    const tts = createTtsProvider("elevenlabs", {
      cacheDir: dir,
      env: { ELEVENLABS_API_KEY: "test-key" },
      fetch,
    });
    const result = await tts.synthesize("Hello", { voiceId: "voice123", speakingRate: 1.1 });
    await tts.synthesize("Hello", { voiceId: "voice123", speakingRate: 1.1 });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice123?output_format=mp3_44100_128",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body as string)).toEqual({
      text: "Hello",
      model_id: "eleven_multilingual_v2",
      voice_settings: { speed: 1.1 },
    });
    expect(result.path.endsWith(".mp3")).toBe(true);
    expect(result.durationSeconds).toBeCloseTo(1152 / 44100, 6);
  });

  it("elevenlabs surfaces HTTP errors", async () => {
    const fetch = vi.fn(async () => new Response('{"detail":"invalid voice"}', { status: 422 }));
    const tts = createTtsProvider("elevenlabs", {
      cacheDir: dir,
      env: { ELEVENLABS_API_KEY: "k" },
      fetch,
    });
    await expect(tts.synthesize("Hi")).rejects.toThrow(/HTTP 422.*invalid voice/);
  });

  it("gemini sends the documented request and wraps raw PCM as WAV", async () => {
    const pcm = new Uint8Array(24000 * 2 * 2); // 2 s of 24 kHz mono 16-bit
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output_audio: {
              type: "audio",
              mime_type: "audio/l16",
              sample_rate: 24000,
              data: Buffer.from(pcm).toString("base64"),
            },
          }),
          { status: 200 },
        ),
    );
    const tts = createTtsProvider("gemini", {
      cacheDir: dir,
      env: { GEMINI_API_KEY: "g-key" },
      fetch,
    });
    const result = await tts.synthesize("Hello", { voiceId: "Puck", speakingRate: 0.7 });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gemini-3.8-flash-tts");
    expect(body.input[0].text).toBe("Hello");
    expect(body.input[0].annotations[0].type).toBe("speech_metadata");
    expect(body.input[0].annotations[0].style).toContain("slow");
    expect(body.response_format).toEqual({ type: "audio" });
    expect(body.generation_config).toEqual({ speech_config: [{ voice: "Puck" }] });

    expect(result.path.endsWith(".wav")).toBe(true);
    expect(result.durationSeconds).toBeCloseTo(2, 6);
    const written = await readFile(result.path);
    expect(written.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("gemini reads the PCM sample rate from the mime type", async () => {
    const pcm = new Uint8Array(16000 * 2); // 1 s at 16 kHz
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_audio: { mime_type: "audio/L16;codec=pcm;rate=16000", data: Buffer.from(pcm).toString("base64") },
          }),
          { status: 200 },
        ),
    );
    const tts = createTtsProvider("gemini", { cacheDir: dir, env: { GEMINI_API_KEY: "k" }, fetch });
    expect((await tts.synthesize("Hi")).durationSeconds).toBeCloseTo(1, 6);
  });

  it("gemini keeps a WAV response as is", async () => {
    const wav = silentWav(1.5, 24000);
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ output_audio: { mime_type: "audio/wav", data: Buffer.from(wav).toString("base64") } }),
          { status: 200 },
        ),
    );
    const tts = createTtsProvider("gemini", { cacheDir: dir, env: { GEMINI_API_KEY: "k" }, fetch });
    const result = await tts.synthesize("Hi");
    expect(result.durationSeconds).toBeCloseTo(1.5, 6);
    expect(new Uint8Array(await readFile(result.path))).toEqual(wav);
  });

  it("gemini reports a response without audio", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status: "failed" }), { status: 200 }));
    const tts = createTtsProvider("gemini", { cacheDir: dir, env: { GEMINI_API_KEY: "k" }, fetch });
    await expect(tts.synthesize("Hi")).rejects.toThrow(/no audio \(status failed\)/);
  });

  it("maps speaking rate to a pacing hint", () => {
    expect(pacingHint(1)).toBeUndefined();
    expect(pacingHint(0.7)).toMatch(/slow/);
    expect(pacingHint(1.3)).toMatch(/fast/);
  });
});
