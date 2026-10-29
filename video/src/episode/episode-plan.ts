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
 * 用默认停顿加分镜的停顿覆盖算出时间轴（ADR-0003），再排出每个组件的入场、
 * 退场和切换状态（ADR-0011）。排不出来时（比如触发帧落在画面之外）抛错。
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
  return { manifest, timeline, cues };
};
