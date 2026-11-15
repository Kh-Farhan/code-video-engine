import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { convertToMonoWav } from "../align/whisper";
import { splitWords } from "../captions/text";
import { wordWeight } from "../captions/timing";
import type { WordCaption, WordTimingSource } from "../schema/manifest";
import type { Script } from "../schema/script";
import {
  chunkAtSentences,
  decodeWav,
  durationMs,
  encodeWav,
  isWav,
  joinChunks,
  joinNarration,
  narrationAudio,
  speechBounds,
  tightenPauses,
  toPublicPath,
  type MonoPcm,
  type TtsProvider,
} from "../tts";
import type { Reporter } from "./progress";

/**
 * Continuous narration: the whole script voiced as one track instead of one
 * file per scene. Scene narrations are joined in order and synthesized in
 * one pass (split at sentence boundaries only when the provider limits input
 * length), then leading and trailing silence is trimmed and long pauses are
 * shortened. Word timings come from whisper alignment of the final track
 * when it is available, else they are estimated inside each sentence span
 * the provider reported. Scene timing is derived from the words later, in
 * the manifest.
 */

/** A stretch of the final track and the text spoken in it, in ms. */
export type TrackSegment = { text: string; startMs: number; endMs: number };

export type ContinuousTrack = {
  /** Path relative to public/. */
  audio: string;
  durationSeconds: number;
  /** The text that was synthesized. */
  text: string;
  /** Sentence (or chunk) spans in the final track, narrowed to detected speech. */
  segments: TrackSegment[];
  chunks: number;
  /** False for silent audio (mock), where nothing was trimmed. */
  hasSpeech: boolean;
};

/** Bump when the processing changes so old processed tracks are not reused. */
const TRACK_VERSION = 1;

/** Reads any audio file the providers produce as mono PCM. Non-WAV goes through ffmpeg. */
export const decodeAudioFile = async (path: string): Promise<MonoPcm> => {
  const bytes = new Uint8Array(await readFile(path));
  if (isWav(bytes)) return decodeWav(bytes);
  const dir = await mkdtemp(join(tmpdir(), "cve-decode-"));
  try {
    const wav = join(dir, "decoded.wav");
    await convertToMonoWav(path, wav);
    return decodeWav(new Uint8Array(await readFile(wav)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const exists = async (path: string) => {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
};

/** Voices the script as one track and writes it to `audioDir`. */
export const voiceContinuous = async (
  script: Pick<Script, "scenes">,
  provider: TtsProvider,
  report: Pick<Reporter, "info">,
  { publicDir, audioDir }: { publicDir: string; audioDir: string },
  voiceId?: string,
  speakingRate = 1,
  decode: (path: string) => Promise<MonoPcm> = decodeAudioFile,
): Promise<ContinuousTrack> => {
  const text = joinNarration(script.scenes.map((s) => s.narration));
  const chunks = chunkAtSentences(text, provider.maxInputChars);
  if (chunks.length > 1) {
    report.info(
      `${provider.name} takes at most ${provider.maxInputChars} characters per request; voicing ${text.length} characters in ${chunks.length} chunks split at sentences`,
    );
  }

  const pieces: { pcm: MonoPcm; path: string; segments: TrackSegment[] }[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const result = await provider.synthesize(chunk, { voiceId, speakingRate });
    const pcm = await decode(result.path);
    const chunkMs = durationMs(pcm);
    const segments = result.segments?.length
      ? result.segments.map((s) => ({
          text: s.text,
          startMs: Math.min(chunkMs, s.startSeconds * 1000),
          endMs: Math.min(chunkMs, s.endSeconds * 1000),
        }))
      : [{ text: chunk, startMs: 0, endMs: chunkMs }];
    report.info(
      `${chunks.length > 1 ? `chunk ${i + 1}/${chunks.length}: ` : ""}${(chunkMs / 1000).toFixed(2)}s, ${segments.length} ${segments.length === 1 ? "segment" : "segments"} ${result.cached ? "cached" : "generated"}`,
    );
    pieces.push({ pcm, path: result.path, segments });
  }

  const joined = joinChunks(pieces.map((p) => p.pcm));
  const tightened = tightenPauses(joined.pcm);
  const bounds = tightened.hasSpeech ? speechBounds(tightened.pcm) : undefined;
  const segments = pieces.flatMap((p, i) =>
    p.segments.map((s) => {
      const startMs = tightened.map(joined.offsetsMs[i]! + s.startMs);
      const endMs = tightened.map(joined.offsetsMs[i]! + s.endMs);
      const speech = bounds?.(startMs, endMs);
      return speech ? { text: s.text, ...speech } : { text: s.text, startMs, endMs };
    }),
  );
  if (tightened.hasSpeech) {
    report.info(
      `trimmed ${(tightened.removedMs / 1000).toFixed(2)}s of silence, ${tightened.pausesShortened} long ${tightened.pausesShortened === 1 ? "pause" : "pauses"} shortened to ${narrationAudio.targetPauseMs}ms`,
    );
  } else {
    report.info("no speech detected (silent audio), so nothing was trimmed");
  }

  const key = createHash("sha256")
    .update(JSON.stringify({ v: TRACK_VERSION, narrationAudio, sources: pieces.map((p) => basename(p.path)) }))
    .digest("hex")
    .slice(0, 32);
  const path = join(audioDir, `narration-${key}.wav`);
  if (!(await exists(path))) {
    await mkdir(audioDir, { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, encodeWav(tightened.pcm));
      await rename(tmp, path);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }
  const durationSeconds = durationMs(tightened.pcm) / 1000;
  report.info(`narration track: ${durationSeconds.toFixed(2)}s -> ${path}`);
  return {
    audio: toPublicPath(path, publicDir),
    durationSeconds,
    text,
    segments,
    chunks: chunks.length,
    hasSpeech: tightened.hasSpeech,
  };
};

/** Script words as Remotion captions: leading space on every word but the first. */
const caption = (text: string, k: number, startMs: number, endMs: number): WordCaption => ({
  text: k === 0 ? text : ` ${text}`,
  startMs: Math.round(startMs),
  endMs: Math.round(Math.max(startMs, endMs)),
  timestampMs: null,
  confidence: null,
});

/** Spreads words over [startMs, endMs) by spoken length, back to back. */
const spread = (words: readonly string[], startMs: number, endMs: number): { startMs: number; endMs: number }[] => {
  const weights = words.map(wordWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  const span = Math.max(0, endMs - startMs);
  let at = startMs;
  return weights.map((w) => {
    const from = at;
    at += (span * w) / total;
    return { startMs: from, endMs: at };
  });
};

export type SceneWords = { words: WordCaption[]; source: WordTimingSource };

/**
 * Every script word of every scene timed on the track (ms from the track
 * start). `aligned` is whisper's result for the whole track, one caption per
 * word of all narrations in order; it is used when it covers exactly those
 * words. Otherwise words are spread over the provider's sentence spans, or
 * over the whole track when those do not line up with the script.
 */
export const continuousSceneWords = (
  narrations: readonly string[],
  track: Pick<ContinuousTrack, "segments" | "durationSeconds">,
  aligned?: readonly WordCaption[],
): SceneWords[] => {
  const perScene = narrations.map(splitWords);
  const all = perScene.flat();
  const split = (timed: readonly { startMs: number; endMs: number }[], source: WordTimingSource) => {
    let i = 0;
    return perScene.map((words) => ({
      source,
      words: words.map((w, k) => {
        const t = timed[i++]!;
        return caption(w, k, t.startMs, t.endMs);
      }),
    }));
  };

  if (aligned && aligned.length === all.length && aligned.every((c, i) => c.text.trim() === all[i])) {
    return split(aligned, "aligned");
  }
  const segmentWords = track.segments.map((s) => splitWords(s.text));
  if (segmentWords.reduce((n, w) => n + w.length, 0) === all.length) {
    return split(
      track.segments.flatMap((s, i) => spread(segmentWords[i]!, s.startMs, s.endMs)),
      "estimated",
    );
  }
  const first = track.segments[0]?.startMs ?? 0;
  const last = track.segments.at(-1)?.endMs ?? track.durationSeconds * 1000;
  return split(spread(all, first, Math.max(first, last)), "estimated");
};

/** The text whisper is aligned against: every scene's script words, in order. */
export const alignmentText = (narrations: readonly string[]): string =>
  narrations.flatMap(splitWords).join(" ");
