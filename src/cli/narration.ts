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
  decodeWav,
  durationMs,
  encodeWav,
  isWav,
  joinGapMs,
  msToSamples,
  narrationAudio,
  narrationBreaks,
  planChunks,
  resolvePauses,
  shapeChunk,
  toPublicPath,
  trimLeadingSilence,
  type MonoPcm,
  type ShapedChunk,
  type TtsProvider,
} from "../tts";
import type { Reporter } from "./progress";

/**
 * Continuous narration: the whole script voiced as one track instead of one
 * file per scene. Scene narrations are joined in order and synthesized in
 * one pass (split at pause markers, and at sentence boundaries only when the
 * provider limits input length). Natural pauses are kept, only pauses that
 * are too long are shortened, and every comma, sentence end and scene
 * boundary gets a minimum pause (see src/tts/pauses.ts). Word timings come from whisper alignment of the final track
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
const TRACK_VERSION = 3;

export type VoiceContinuousOptions = {
  /** Overrides style.questionChunks (the --no-question-chunks flag). */
  questionChunks?: boolean;
  /** --debug-tts: the chunk plan and the exact text of every chunk. */
  debug?: (message: string) => void;
};

export const countQuestionMarks = (text: string): number => (text.match(/\?/g) ?? []).length;

/**
 * Whether questions get their own chunk: the flag, else style.questionChunks,
 * else on. Only for providers that voice each request in isolation (Kokoro,
 * mock); context-aware providers (Gemini, ElevenLabs) keep the whole text.
 */
export const resolveQuestionChunks = (
  script: Partial<Pick<Script, "style">>,
  provider: Pick<TtsProvider, "questionChunks">,
  override?: boolean,
): boolean => !!provider.questionChunks && (override ?? script.style?.questionChunks ?? true);

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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Voices the script as one track and writes it to `audioDir`. Synthesis is
 * split only at pause markers and, when the provider limits input length,
 * at sentence ends. Each chunk keeps its natural pauses (only those over
 * `pauses.maxMs` are shortened), every comma, sentence end and scene
 * boundary gets at least its minimum pause, and chunks are joined with the
 * silence their boundary asks for. Segments are on the final track.
 */
export const voiceContinuous = async (
  script: { scenes: readonly Pick<Script["scenes"][number], "narration">[] } & Partial<Pick<Script, "style">>,
  provider: TtsProvider,
  report: Pick<Reporter, "info">,
  { publicDir, audioDir }: { publicDir: string; audioDir: string },
  voiceId?: string,
  speakingRate = 1,
  decode: (path: string) => Promise<MonoPcm> = decodeAudioFile,
  options: VoiceContinuousOptions = {},
): Promise<ContinuousTrack> => {
  const pauses = resolvePauses(script.style?.pauses);
  const breaks = narrationBreaks(script.scenes.map((s) => s.narration), pauses);
  const questionChunks = resolveQuestionChunks(script, provider, options.questionChunks);
  const chunks = planChunks(breaks, provider.maxInputChars, { questionChunks });
  const text = breaks.spoken.join(" ");
  const questions = chunks.filter((c) => c.question).length;
  if (questions > 0) {
    report.info(`${plural(questions, "question")} voiced as ${questions === 1 ? "its own chunk" : "their own chunks"} (questionChunks)`);
  }
  if (options.debug) {
    const sourceQ = script.scenes.reduce((n, s) => n + countQuestionMarks(s.narration), 0);
    const sentQ = chunks.reduce((n, c) => n + countQuestionMarks(c.text), 0);
    options.debug(
      `question marks: ${sourceQ} in the script, ${sentQ} in the text sent to ${provider.name}${sourceQ === sentQ ? "" : " (MISMATCH: a step dropped or added one)"}; questionChunks ${questionChunks ? "on" : "off"}`,
    );
    chunks.forEach((c, i) => {
      const after = breaks.breaks[c.to - 1];
      options.debug!(
        `chunk ${i + 1}/${chunks.length}${c.question ? " (question)" : ""}: ${JSON.stringify(c.text)}${after ? `, then ${after.minMs}ms ${after.kind ?? "marker"} pause` : ""}`,
      );
    });
  }
  const markers = breaks.breaks.filter((b) => b?.markerMs !== undefined).length;
  if (markers > 0) {
    report.info(`${plural(markers, "pause marker")}: voicing in ${plural(chunks.length, "part")} split at the markers`);
  }
  if (provider.maxInputChars !== undefined && text.length > provider.maxInputChars) {
    report.info(
      `${provider.name} takes at most ${provider.maxInputChars} characters per request; voicing ${text.length} characters in ${plural(chunks.length, "chunk")} split at sentences`,
    );
  }

  type Piece = { shaped: ShapedChunk; path: string; chunk: (typeof chunks)[number] };
  const pieces: Piece[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const result = await provider.synthesize(chunk.text, { voiceId, speakingRate });
    const pcm = await decode(result.path);
    const chunkMs = durationMs(pcm);
    const segments = result.segments?.map((s) => ({
      text: s.text,
      startMs: Math.min(chunkMs, s.startSeconds * 1000),
      endMs: Math.min(chunkMs, s.endSeconds * 1000),
    }));
    const shaped = shapeChunk(
      pcm,
      breaks.words.slice(chunk.from, chunk.to),
      breaks.breaks.slice(chunk.from, chunk.to),
      segments,
      pauses,
    );
    report.info(
      `${chunks.length > 1 ? `chunk ${i + 1}/${chunks.length}: ` : ""}${(chunkMs / 1000).toFixed(2)}s, ${plural(segments?.length ?? 1, "segment")} ${result.cached ? "cached" : "generated"}`,
    );
    pieces.push({ shaped, path: result.path, chunk });
  }

  // Join: between chunks, the silence the boundary after the chunk's last word asks for.
  const rate = pieces[0]!.shaped.pcm.sampleRate;
  if (pieces.some((p) => p.shaped.pcm.sampleRate !== rate)) {
    throw new Error(`audio chunks have different sample rates (${pieces.map((p) => p.shaped.pcm.sampleRate).join(", ")})`);
  }
  const gaps = pieces.map((p, i) => {
    const next = pieces[i + 1];
    if (!next) return 0;
    const owed = breaks.breaks[p.chunk.to - 1]?.minMs ?? 0;
    return msToSamples(joinGapMs(owed, p.shaped.tailMs, next.shaped.leadMs), rate);
  });
  const samples = new Float32Array(pieces.reduce((n, p, i) => n + p.shaped.pcm.samples.length + gaps[i]!, 0));
  const segments: TrackSegment[] = [];
  let at = 0;
  pieces.forEach((p, i) => {
    samples.set(p.shaped.pcm.samples, at);
    const offsetMs = (at * 1000) / rate;
    for (const span of p.shaped.spans) {
      segments.push({
        text: breaks.words.slice(p.chunk.from + span.from, p.chunk.from + span.to).join(" "),
        startMs: offsetMs + span.startMs,
        endMs: offsetMs + span.endMs,
      });
    }
    at += p.shaped.pcm.samples.length + gaps[i]!;
  });
  const hasSpeech = pieces.some((p) => p.shaped.hasSpeech);
  // The hook must be heard right away: speech starts within maxStartMs of frame 0.
  const start = trimLeadingSilence({ sampleRate: rate, samples });
  const track: MonoPcm = start.pcm;
  if (start.removedMs > 0) {
    for (const s of segments) {
      s.startMs = Math.max(0, s.startMs - start.removedMs);
      s.endMs = Math.max(s.startMs, s.endMs - start.removedMs);
    }
    report.info(`trimmed ${(start.removedMs / 1000).toFixed(2)}s of leading silence`);
  }
  if (hasSpeech) {
    report.info(`narration starts at ${(start.startMs / 1000).toFixed(2)}s (at most ${(narrationAudio.maxStartMs / 1000).toFixed(2)}s)`);
  }

  const sum = (f: (s: ShapedChunk) => number) => pieces.reduce((n, p) => n + f(p.shaped), 0);
  const joinMs = gaps.reduce((n, g) => n + (g * 1000) / rate, 0);
  if (hasSpeech) {
    report.info(
      `kept natural pauses: trimmed ${(sum((s) => s.removedMs) / 1000).toFixed(2)}s of edge silence and over-long pauses, ${plural(sum((s) => s.pausesShortened), "pause")} over ${pauses.maxMs}ms shortened to ${pauses.shortenToMs}ms`,
    );
  } else {
    report.info("no speech detected (silent audio), so nothing was trimmed");
  }
  report.info(
    `minimum pauses (comma ${pauses.commaMs}ms, sentence ${pauses.sentenceMs}ms, scene ${pauses.sceneMs}ms): padded ${plural(sum((s) => s.padded) + gaps.filter((g) => g > 0).length, "pause")}, +${((sum((s) => s.paddedMs) + joinMs) / 1000).toFixed(2)}s of silence`,
  );
  const unplaced = sum((s) => s.unplaced);
  if (unplaced > 0) {
    report.info(`warning: ${plural(unplaced, "pause")} could not be found in the audio and were left as spoken`);
  }

  const key = createHash("sha256")
    .update(
      JSON.stringify({
        v: TRACK_VERSION,
        narrationAudio,
        pauses,
        chunks: chunks.map((c) => [c.from, c.to, breaks.breaks[c.to - 1]?.minMs ?? 0]),
        breaks: breaks.breaks.map((b) => b?.minMs ?? 0),
        sources: pieces.map((p) => basename(p.path)),
      }),
    )
    .digest("hex")
    .slice(0, 32);
  const path = join(audioDir, `narration-${key}.wav`);
  if (!(await exists(path))) {
    await mkdir(audioDir, { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, encodeWav(track));
      await rename(tmp, path);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }
  const durationSeconds = durationMs(track) / 1000;
  report.info(`narration track: ${durationSeconds.toFixed(2)}s -> ${path}`);
  return {
    audio: toPublicPath(path, publicDir),
    durationSeconds,
    text,
    segments,
    chunks: chunks.length,
    hasSpeech,
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
