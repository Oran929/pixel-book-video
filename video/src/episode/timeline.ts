import type { EpisodeManifest } from "./manifest";

// 停顿规则只在这里定义（ADR-0003），Python 里不出现停顿秒数
export type Pauses = {
  /** 同一画面内，句与句之间的停顿（秒） */
  betweenLines: number;
  /** 换画面（包括换段）时的停顿（秒） */
  sceneChange: number;
};

export const DEFAULT_PAUSES: Pauses = { betweenLines: 0.3, sceneChange: 0.8 };

/** 分镜对个别位置的停顿覆盖：旁白句 ID → 这句之后的停顿（秒），优先于默认规则 */
export type PauseOverrides = Readonly<Record<string, number>>;

/** 帧区间：startFrame 含，endFrame 不含 */
export type FrameSpan = { startFrame: number; endFrame: number };

export type TimedLine = EpisodeManifest["lines"][number] & FrameSpan;

export type Timeline = {
  fps: number;
  /** 片头、正文、片尾加起来的总帧数 */
  totalFrames: number;
  /** 片头占的帧数（#50）：正文从这一帧开始；不用片头时为 0 */
  introFrames: number;
  /** 片尾占的帧数（#51）：最后这么多帧是片尾，正文在它之前结束；不用片尾时为 0 */
  outroFrames: number;
  /** 每句音频占据的帧（不含之后的停顿） */
  lines: TimedLine[];
  /** 从第一句开始到下一个画面开始（最后一个画面到正文结束，即片尾开始） */
  scenes: (EpisodeManifest["scenes"][number] & FrameSpan)[];
  segments: ({ id: string; title: string } & FrameSpan)[];
};

// 句子时长向上取整，保证音频不被截断；停顿四舍五入
const lineFrames = (seconds: number, fps: number) => Math.ceil(seconds * fps);
const pauseFrames = (seconds: number, fps: number) => Math.round(seconds * fps);

/** 正文前后接的片头、片尾各占几帧（#50、#51），默认都没有 */
export type BookendFrames = { introFrames?: number; outroFrames?: number };

export const computeTimeline = (
  manifest: EpisodeManifest,
  pauses: Pauses,
  fps: number,
  overrides: PauseOverrides = {},
  { introFrames = 0, outroFrames = 0 }: BookendFrames = {},
): Timeline => {
  const lines: TimedLine[] = [];
  // 正文接在片头后面
  let cursor = introFrames;
  manifest.lines.forEach((line, index) => {
    const previous = manifest.lines[index - 1];
    if (previous) {
      const pause =
        overrides[previous.id] ??
        (previous.scene === line.scene ? pauses.betweenLines : pauses.sceneChange);
      cursor += pauseFrames(pause, fps);
    }
    const endFrame = cursor + lineFrames(line.seconds, fps);
    lines.push({ ...line, startFrame: cursor, endFrame });
    cursor = endFrame;
  });
  // 正文到最后一句音频结束为止，片尾紧接着开始
  const bodyEnd = cursor;
  const totalFrames = bodyEnd + outroFrames;

  // 一组连续的区间：每个从它的第一句开始，到下一个的开始（最后一个到正文结束）
  const spans = <T extends { id: string }>(
    items: T[],
    firstLine: (item: T) => TimedLine | undefined,
  ): (T & FrameSpan)[] => {
    const starts = items.map((item) => {
      const first = firstLine(item);
      if (!first) throw new Error(`合成清单里 ${item.id} 没有旁白句`);
      return first.startFrame;
    });
    return items.map((item, i) => ({
      ...item,
      startFrame: starts[i]!,
      endFrame: starts[i + 1] ?? bodyEnd,
    }));
  };

  const scenes = spans(manifest.scenes, (scene) =>
    lines.find((line) => line.scene === scene.id),
  );
  const segments = spans(manifest.segments, (segment) => {
    const scene = scenes.find((s) => s.segment === segment.id);
    return scene && lines.find((line) => line.scene === scene.id);
  });
  return { fps, totalFrames, introFrames, outroFrames, lines, scenes, segments };
};

/** 第 `frame` 帧时字幕框显示的旁白句：配音开始时出现，到下一句开始时切换 */
export const lineAt = (timeline: Timeline, frame: number): TimedLine | undefined =>
  timeline.lines.findLast((line) => line.startFrame <= frame);

/** 正文结束（不含）、片尾开始的那一帧；没有片尾时是总帧数 */
export const bodyEndFrame = (timeline: Timeline): number =>
  timeline.totalFrames - timeline.outroFrames;

/** 第 `frame` 帧时显示常驻组件（字幕和主题）吗：片头、片尾期间不显示（spec #16 修订二、修订三） */
export const showsResidents = (timeline: Timeline, frame: number): boolean =>
  frame >= timeline.introFrames && frame < bodyEndFrame(timeline);
