import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { COMPONENT_SCHEMAS } from "../components/schemas";
import { VIDEO } from "../video-config";
import { parseManifest } from "./manifest";
import { parseStoryboard, pauseOverrides } from "./storyboard";
import { computeTimeline, DEFAULT_PAUSES, type Timeline } from "./timeline";

// 期目录里的文件名，与 tools/src/pixelbook/pipeline.py 一致
const MANIFEST_FILE = "episode.json";
const STORYBOARD_FILE = "storyboard.json";
export const TIMELINE_FILE = "timeline.json";

/**
 * 读期目录里的合成清单（有分镜时也读分镜，取它的停顿覆盖），用 Remotion 里
 * 同一套校验和时间轴函数算出时间轴，写成 `timeline.json`（供 Python 的试听拼接读取）。
 */
export type ExportOptions = {
  /** false：不读分镜，只用默认停顿（单独评估默认值时用） */
  storyboard?: boolean;
  /** 写到哪里，默认期目录里的 `timeline.json` */
  out?: string;
};

export const exportTimeline = (
  episodeDir: string,
  {
    storyboard: useStoryboard = true,
    out = join(episodeDir, TIMELINE_FILE),
  }: ExportOptions = {},
): Timeline => {
  const readJson = (file: string) =>
    JSON.parse(readFileSync(join(episodeDir, file), "utf8")) as unknown;
  const manifest = parseManifest(readJson(MANIFEST_FILE));
  const storyboard =
    useStoryboard && existsSync(join(episodeDir, STORYBOARD_FILE))
      ? parseStoryboard(readJson(STORYBOARD_FILE), manifest, COMPONENT_SCHEMAS)
      : null;
  const timeline = computeTimeline(
    manifest,
    DEFAULT_PAUSES,
    VIDEO.fps,
    storyboard ? pauseOverrides(storyboard) : {},
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(timeline, null, 2) + "\n");
  return timeline;
};
