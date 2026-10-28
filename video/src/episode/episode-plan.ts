// 一期的编排：合成清单（和分镜）→ 时间轴和组件的触发。
// Remotion 的 calculateMetadata 和时间轴导出命令（Node 里运行）都调用它，
// 所以这里不引用 React 和 remotion。
import { COMPONENT_PROPS } from "../components/schemas";
import { VIDEO } from "../video-config";
import { type EpisodeManifest, parseManifest } from "./manifest";
import {
  type Cue,
  parseStoryboard,
  pauseOverrides,
  scheduleCues,
} from "./storyboard";
import { computeTimeline, DEFAULT_PAUSES, type Timeline } from "./timeline";

export type EpisodePlan = {
  manifest: EpisodeManifest;
  timeline: Timeline;
  /** 组件的触发；没有分镜时为空 */
  cues: Cue[];
};

/**
 * 校验合成清单和分镜（`storyboardData` 为 null 表示没有分镜，只渲染字幕），
 * 用默认停顿加分镜的停顿覆盖算出时间轴（ADR-0003），再排出组件的触发帧。
 * 触发帧落在画面之外时抛错。
 */
export const planEpisode = (
  manifestData: unknown,
  storyboardData: unknown,
): EpisodePlan => {
  const manifest = parseManifest(manifestData);
  const storyboard =
    storyboardData === null
      ? null
      : parseStoryboard(storyboardData, manifest, COMPONENT_PROPS);
  const timeline = computeTimeline(
    manifest,
    DEFAULT_PAUSES,
    VIDEO.fps,
    storyboard ? pauseOverrides(storyboard) : {},
  );
  const cues = storyboard ? scheduleCues(storyboard, timeline) : [];
  return { manifest, timeline, cues };
};
