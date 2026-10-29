import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { writeCredits } from "../music/credits";
import { CROSSFADE_FRAMES, type MusicPlay, musicPlays } from "../music/crossfade";
import { MUSIC, trackFrames } from "../music/tracks";
import { VOLUME_DB } from "../style/volume";
import { type MusicPlan, planEpisode } from "./episode-plan";
import { durationReport, segmentsText, type DurationReport } from "./rhythm";
import type { SoundCue } from "../sound/sounds";
import type { Timeline } from "./timeline";

// 期目录里的文件名，与 tools/src/pixelbook/pipeline.py 一致
const MANIFEST_FILE = "episode.json";
const STORYBOARD_FILE = "storyboard.json";
export const TIMELINE_FILE = "timeline.json";
export const SEGMENTS_FILE = "segments.txt";

/**
 * 读期目录里的合成清单（有分镜时也读分镜，取它的停顿覆盖），用 Remotion 里
 * 同一个 `planEpisode` 算出时间轴，连同总时长报告和音效列表写成 `timeline.json`
 * （供 Python 的试听拼接读取）。写到期目录里时，同时写出打点时间表 `segments.txt`，
 * 配乐要署名（CC-BY）时还写出署名 `credits.txt`（#52）。
 */
export type ExportOptions = {
  /** false：不读分镜，只用默认停顿（单独评估默认值时用） */
  storyboard?: boolean;
  /** 写到哪里，默认期目录里的 `timeline.json` */
  out?: string;
};

/**
 * `timeline.json` 的内容：时间轴，外加总时长报告、要放的音效（帧、音效 ID；
 * 冒烟测试用它检查成片里每个音效帧附近有声音）和配乐（曲子 ID、每次循环、淡出起始帧；
 * 全长试验和冒烟测试用它造参照）。Python 只读需要的字段。
 */
export type ExportedTimeline = Timeline & {
  duration: DurationReport;
  sounds: SoundCue[];
  music: ExportedMusic | null;
};

/**
 * 配乐，外加文件（以 `video/public/` 为起点）、曲长几帧、每次循环（起止帧和交叉淡化的帧区间，
 * 见 `musicPlays`）、每个接缝交叉淡化几帧（`CROSSFADE_FRAMES`）和音量（dB，相对旁白）
 */
export type ExportedMusic = MusicPlan & {
  file: string;
  trackFrames: number;
  plays: MusicPlay[];
  crossfadeFrames: number;
  volumeDb: number;
};

export type ExportResult = {
  timeline: ExportedTimeline;
  /** 写出的打点时间表；`out` 不是期目录里的 `timeline.json` 时不写，为 null */
  segmentsFile: string | null;
  /** 写出的配乐署名；不用署名，或 `out` 不是期目录里的 `timeline.json` 时为 null */
  creditsFile: string | null;
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
  // 和 Remotion 用同一个函数：触发帧落在画面之外时在这里就报错，不用等到渲染
  const { timeline: computed, sounds, music } = planEpisode(
    readJson(MANIFEST_FILE),
    useStoryboard && existsSync(join(episodeDir, STORYBOARD_FILE))
      ? readJson(STORYBOARD_FILE)
      : null,
  );
  const timeline = {
    ...computed,
    duration: durationReport(computed),
    sounds,
    music: music && {
      ...music,
      file: MUSIC[music.track].file,
      trackFrames: trackFrames(music.track),
      plays: musicPlays(music, trackFrames(music.track)),
      crossfadeFrames: CROSSFADE_FRAMES,
      volumeDb: VOLUME_DB.music,
    },
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(timeline, null, 2) + "\n");

  // 打点时间表和署名只跟期目录里的 timeline.json 走：写到别处的多半是试听用的时间轴，
  // 不应覆盖期目录里正式的打点时间表和署名
  const intoEpisode = resolve(out) === resolve(episodeDir, TIMELINE_FILE);
  const segmentsFile = intoEpisode ? join(episodeDir, SEGMENTS_FILE) : null;
  if (segmentsFile) writeFileSync(segmentsFile, segmentsText(timeline));
  const creditsFile = intoEpisode ? writeCredits(episodeDir, music && MUSIC[music.track]) : null;
  return { timeline, segmentsFile, creditsFile };
};
