import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { COMPONENT_SCHEMAS } from "../components/schemas";
import { VIDEO } from "../video-config";
import { parseManifest } from "./manifest";
import { durationReport, segmentsText, type DurationReport } from "./rhythm";
import { parseStoryboard, pauseOverrides, scheduleCues } from "./storyboard";
import { computeTimeline, DEFAULT_PAUSES, type Timeline } from "./timeline";

// 期目录里的文件名，与 tools/src/pixelbook/pipeline.py 一致
const MANIFEST_FILE = "episode.json";
const STORYBOARD_FILE = "storyboard.json";
export const TIMELINE_FILE = "timeline.json";
export const SEGMENTS_FILE = "segments.txt";

/**
 * 读期目录里的合成清单（有分镜时也读分镜，取它的停顿覆盖），用 Remotion 里
 * 同一套校验和时间轴函数算出时间轴，连同总时长报告写成 `timeline.json`
 * （供 Python 的试听拼接读取）。写到期目录里时，同时写出打点时间表 `segments.txt`。
 */
export type ExportOptions = {
  /** false：不读分镜，只用默认停顿（单独评估默认值时用） */
  storyboard?: boolean;
  /** 写到哪里，默认期目录里的 `timeline.json` */
  out?: string;
};

/** `timeline.json` 的内容：时间轴，外加总时长报告（Python 只读时间轴的字段） */
export type ExportedTimeline = Timeline & { duration: DurationReport };

export type ExportResult = {
  timeline: ExportedTimeline;
  /** 写出的打点时间表；`out` 不是期目录里的 `timeline.json` 时不写，为 null */
  segmentsFile: string | null;
};

export const exportTimeline = (
  episodeDir: string,
  {
    storyboard: useStoryboard = true,
    out = join(episodeDir, TIMELINE_FILE),
  }: ExportOptions = {},
): ExportResult => {
  const readJson = (file: string) =>
    JSON.parse(readFileSync(join(episodeDir, file), "utf8")) as unknown;
  const manifest = parseManifest(readJson(MANIFEST_FILE));
  const storyboard =
    useStoryboard && existsSync(join(episodeDir, STORYBOARD_FILE))
      ? parseStoryboard(readJson(STORYBOARD_FILE), manifest, COMPONENT_SCHEMAS)
      : null;
  const computed = computeTimeline(
    manifest,
    DEFAULT_PAUSES,
    VIDEO.fps,
    storyboard ? pauseOverrides(storyboard) : {},
  );
  // 和 Remotion 一样排出组件的触发帧：触发帧落在画面之外时在这里就报错，不用等到渲染
  if (storyboard) scheduleCues(storyboard, computed);
  const timeline = { ...computed, duration: durationReport(computed) };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(timeline, null, 2) + "\n");

  // 打点时间表只跟期目录里的 timeline.json 走：写到别处的多半是试听用的时间轴，
  // 不应覆盖期目录里正式的打点时间表
  const intoEpisode = resolve(out) === resolve(episodeDir, TIMELINE_FILE);
  const segmentsFile = intoEpisode ? join(episodeDir, SEGMENTS_FILE) : null;
  if (segmentsFile) writeFileSync(segmentsFile, segmentsText(timeline));
  return { timeline, segmentsFile };
};
