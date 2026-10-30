import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { measureAudioDuration } from "./duration";
import { normalizeRequest, type TtsBackend, type TtsProvider } from "./types";

/**
 * Default cache location when no slug-specific dir is given. Under public/ so
 * Remotion can serve the files. Prefer `audioDirForSlug` so a video's audio
 * lands in public/audio/<slug>/ as the repo layout expects.
 */
export const DEFAULT_CACHE_DIR = "public/audio/tts-cache";

export const audioDirForSlug = (slug: string, publicDir = "public"): string =>
  join(publicDir, "audio", slug);

/**
 * Converts a file path under `publicDir` to the form the manifest and
 * Remotion's staticFile() expect, e.g. "audio/<slug>/mock-abc.wav".
 */
export const toPublicPath = (path: string, publicDir = "public"): string => {
  const rel = relative(resolve(publicDir), resolve(path));
  if (!rel || rel.startsWith("..") || resolve(rel) === rel) {
    throw new Error(`${path} is not inside ${publicDir}/, so Remotion cannot serve it`);
  }
  return rel.split(sep).join("/");
};

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
  // Concurrent calls for the same key share one generation. `done` closes the
  // gap where a stat() started before a generation finished resolves after it.
  const inFlight = new Map<string, Promise<void>>();
  const done = new Set<string>();

  return {
    name: backend.name,
    defaultVoiceId: backend.defaultVoiceId,
    async synthesize(text, options) {
      const request = normalizeRequest(text, options, backend.defaultVoiceId);
      const key = cacheKey(backend, request);
      const path = join(dir, `${backend.name}-${key}.${backend.extension}`);

      let cached = true;
      let pending = inFlight.get(key);
      if (!pending && !(await exists(path))) {
        pending = inFlight.get(key);
        if (!pending && !done.has(key)) {
          pending = (async () => {
            const { data } = await backend.generate(request.text, request);
            await mkdir(dir, { recursive: true });
            // Write then rename so an interrupted run never leaves a partial file in the cache.
            const tmp = `${path}.${randomUUID()}.tmp`;
            try {
              await writeFile(tmp, data);
              await rename(tmp, path);
            } catch (err) {
              await rm(tmp, { force: true });
              throw err;
            }
            done.add(key);
          })().finally(() => inFlight.delete(key));
          inFlight.set(key, pending);
        }
      }
      if (pending) {
        // Joining a generation counts as not cached: the audio did not exist yet.
        cached = false;
        await pending;
      }

      return { path, durationSeconds: await measureAudioDuration(path), cached };
    },
  };
};
