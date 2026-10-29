// 一期的编排：合成清单（和分镜）→ 时间轴和组件的触发。
// Remotion 的 calculateMetadata 和时间轴导出命令（Node 里运行）都调用它，
// 所以这里不引用 React 和 remotion。
import type { ComponentDeclarations } from "../components/declaration";
import { COMPONENT_DECLARATIONS } from "../components/declarations";
import { bookendFrames } from "../bookend/library";
import { type IntroId, INTROS } from "../intro/intros";
import { type OutroId, OUTROS } from "../outro/outros";
import { PROJECT } from "../project-config";
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
import { bodyEndFrame, computeTimeline, DEFAULT_PAUSES, type Timeline } from "./timeline";

export type EpisodePlan = {
  manifest: EpisodeManifest;
  timeline: Timeline;
  /** 组件的触发；没有分镜时为空 */
  cues: Cue[];
  /** 要放的音效（帧、音效 ID），按帧排序；没有分镜时为空 */
  sounds: SoundCue[];
  /** 配乐；没有分镜（字幕版）时为 null */
  music: MusicPlan | null;
  /** 用的片头、片尾（登记表的 ID）；不用时为 null */
  intro: IntroId | null;
  outro: OutroId | null;
};

/**
 * 配乐：从第 `startFrame` 帧（片头结束）起循环播放 `track`，到第 `endFrame` 帧（不含，
 * 正文结束、片尾开始）为止，从第 `fadeFrom` 帧起淡出到 `endFrame`。
 * 片头片尾自带音轨，配乐不覆盖它们（spec #16 修订二、修订三）
 */
export type MusicPlan = { track: MusicId; startFrame: number; endFrame: number; fadeFrom: number };

export type PlanOptions = {
  /** 用哪个片头（#50、#51），`null` 是不用；默认是项目配置选的。组件样张页不用 */
  intro?: IntroId | null;
  /** 用哪个片尾（#51），`null` 是不用；默认是项目配置选的。组件样张页不用 */
  outro?: OutroId | null;
};

/** 配乐最后淡出的秒数 */
export const MUSIC_FADE_SECONDS = 2;

/**
 * 校验合成清单和分镜（`storyboardData` 为 null 表示没有分镜，只渲染字幕），
 * 用默认停顿加分镜的停顿覆盖算出时间轴（ADR-0003），再排出每个组件的入场、
 * 退场和切换状态（ADR-0011），以及要放的音效。排不出来时（比如触发帧落在画面之外）抛错。
 * 最前面放片头、最后放片尾（默认是项目配置选的）：正文和它上面的组件、音效整体后移片头的
 * 帧数，片尾接在正文最后一句之后；配乐从片头结束放到正文结束，在正文最后 `MUSIC_FADE_SECONDS` 秒淡出。
 * `components` 是组件声明，默认是组件注册表的；测试可以换成假的。
 */
export const planEpisode = (
  manifestData: unknown,
  storyboardData: unknown,
  components: ComponentDeclarations = COMPONENT_DECLARATIONS,
  { intro = PROJECT.intro, outro = PROJECT.outro }: PlanOptions = {},
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
    {
      introFrames: bookendFrames("intro", INTROS, intro),
      outroFrames: bookendFrames("outro", OUTROS, outro),
    },
  );
  const cues = storyboard ? scheduleCues(storyboard, timeline, components) : [];
  const bodyEnd = bodyEndFrame(timeline);
  const music = storyboard
    ? {
        track: storyboard.music as MusicId,
        startFrame: timeline.introFrames,
        endFrame: bodyEnd,
        fadeFrom: Math.max(timeline.introFrames, bodyEnd - MUSIC_FADE_SECONDS * VIDEO.fps),
      }
    : null;
  return { manifest, timeline, cues, sounds: soundCues(cues), music, intro, outro };
};
