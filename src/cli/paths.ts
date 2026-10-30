import { join } from "node:path";
import { audioDirForSlug } from "../tts";
import type { PresetName } from "../theme";

/** Where each pipeline step reads and writes for one video. */
export const pipelinePaths = (
  slug: string,
  { publicDir = "public", outRoot = "out" }: { publicDir?: string; outRoot?: string } = {},
) => {
  const audioDir = audioDirForSlug(slug, publicDir);
  const outDir = join(outRoot, slug);
  return {
    /** Remotion's static folder. */
    publicDir,
    /** public/audio/<slug>/, served to Remotion with staticFile(). */
    audioDir,
    /** Which audio file belongs to which scene, written by `voice`. */
    voiceIndex: join(audioDir, "voice.json"),
    outDir,
    manifest: join(outDir, "manifest.json"),
    srt: join(outDir, `${slug}.srt`),
    video: (preset: PresetName) => join(outDir, `${slug}-${preset}.mp4`),
    thumbnail: (preset: PresetName) => join(outDir, `${slug}-${preset}-thumbnail.png`),
    /** Input props passed to the Remotion CLI. */
    props: (preset: PresetName, kind: "video" | "still") =>
      join(outDir, `props-${preset}-${kind}.json`),
  };
};
