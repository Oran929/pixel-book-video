// 一期的编排：合成清单（和分镜）→ 时间轴和组件的触发。
// Remotion 的 calculateMetadata 和时间轴导出命令（Node 里运行）都调用它，
// 所以这里不引用 React 和 remotion。
import type { ComponentDeclarations } from "../components/declaration";
import { COMPONENT_DECLARATIONS } from "../components/declarations";
import { VIDEO } from "../video-config";
import { type EpisodeManifest, parseManifest } from "./manifest";
import {
  type Cue,
  parseStoryboard,
  pauseOverrides,
  scheduleCues,
  soundCues,
} from "./storyboard";
import type { SoundCue } from "../sound/sounds";
import type { MusicId } from "../music/tracks";
import { computeTimeline, DEFAULT_PAUSES, type Timeline } from "./timeline";

export type EpisodePlan = {
  manifest: EpisodeManifest;
  timeline: Timeline;
  /** 组件的触发；没有分镜时为空 */
  cues: Cue[];
  /** 要放的音效（帧、音效 ID），按帧排序；没有分镜时为空 */
  sounds: SoundCue[];
  /** 配乐；没有分镜（字幕版）时为 null */
  music: MusicPlan | null;
};

/** 配乐：循环播放 `track` 覆盖整期（含片尾），从第 `fadeFrom` 帧起淡出到最后一帧 */
export type MusicPlan = { track: MusicId; fadeFrom: number };

/** 配乐最后淡出的秒数 */
export const MUSIC_FADE_SECONDS = 2;

/**
 * 校验合成清单和分镜（`storyboardData` 为 null 表示没有分镜，只渲染字幕），
 * 用默认停顿加分镜的停顿覆盖算出时间轴（ADR-0003），再排出每个组件的入场、
 * 退场和切换状态（ADR-0011），以及要放的音效。排不出来时（比如触发帧落在画面之外）抛错。
 * `components` 是组件声明，默认是组件注册表的；测试可以换成假的。
 */
export const planEpisode = (
  manifestData: unknown,
  storyboardData: unknown,
  components: ComponentDeclarations = COMPONENT_DECLARATIONS,
): EpisodePlan => {
  const manifest = parseManifest(manifestData);
  const storyboard =
    storyboardData === null
      ? null
      : parseStoryboard(storyboardData, manifest, components);
  const timeline = computeTimeline(
    manifest,
    DEFAULT_PAUSES,
    VIDEO.fps,
    storyboard ? pauseOverrides(storyboard) : {},
  );
  const cues = storyboard ? scheduleCues(storyboard, timeline, components) : [];
  const music = storyboard
    ? {
        track: storyboard.music as MusicId,
        fadeFrom: Math.max(0, timeline.totalFrames - MUSIC_FADE_SECONDS * VIDEO.fps),
      }
    : null;
  return { manifest, timeline, cues, sounds: soundCues(cues), music };
};
