import { createHash } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { measureAudioDuration } from "./duration";
import { normalizeRequest, type TtsBackend, type TtsProvider } from "./types";

/** Default cache location. Under public/ so Remotion can serve the files directly. */
export const DEFAULT_CACHE_DIR = "public/audio/tts-cache";

/** Bump when the key layout changes so old entries are not reused by mistake. */
const CACHE_KEY_VERSION = 1;

export const cacheKey = (
  backend: Pick<TtsBackend, "name" | "cacheIdentity">,
  request: { text: string; voiceId: string; speakingRate: number },
): string => {
  // Sorted keys so the hash does not depend on object literal order.
  const identity = Object.fromEntries(
    Object.entries(backend.cacheIdentity)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const payload = JSON.stringify({
    v: CACHE_KEY_VERSION,
    provider: backend.name,
    voiceId: request.voiceId,
    speakingRate: request.speakingRate,
    identity,
    text: request.text,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
};

const exists = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
};

/**
 * Turns a backend into a provider that reuses a previously generated file
 * when the same text, voice, rate and provider settings were seen before.
 */
export const withCache = (backend: TtsBackend, cacheDir = DEFAULT_CACHE_DIR): TtsProvider => {
  const dir = resolve(cacheDir);
  // Concurrent calls for the same key share one generation.
  const inFlight = new Map<string, Promise<void>>();

  return {
    name: backend.name,
    defaultVoiceId: backend.defaultVoiceId,
    async synthesize(text, options) {
      const request = normalizeRequest(text, options, backend.defaultVoiceId);
      const key = cacheKey(backend, request);
      const path = join(dir, `${backend.name}-${key}.${backend.extension}`);

      let cached = true;
      if (!(await exists(path))) {
        let pending = inFlight.get(key);
        if (!pending) {
          cached = false;
          pending = (async () => {
            const { data } = await backend.generate(request.text, request);
            await mkdir(dir, { recursive: true });
            // Write then rename so an interrupted run never leaves a partial file in the cache.
            const tmp = `${path}.${process.pid}.tmp`;
            await writeFile(tmp, data);
            await rename(tmp, path);
          })().finally(() => inFlight.delete(key));
          inFlight.set(key, pending);
        }
        await pending;
      }

      return { path, durationSeconds: await measureAudioDuration(path), cached };
    },
  };
};
