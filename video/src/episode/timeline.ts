import type { EpisodeManifest } from "./manifest";

// 停顿规则只在这里定义（ADR-0003），Python 里不出现停顿秒数
export type Pauses = {
  /** 同一画面内，句与句之间的停顿（秒） */
  betweenLines: number;
  /** 换画面（包括换段）时的停顿（秒） */
  sceneChange: number;
};

export const DEFAULT_PAUSES: Pauses = { betweenLines: 0.3, sceneChange: 0.8 };

/** 帧区间：startFrame 含，endFrame 不含 */
export type FrameSpan = { startFrame: number; endFrame: number };

export type TimedLine = EpisodeManifest["lines"][number] & FrameSpan;

export type Timeline = {
  fps: number;
  totalFrames: number;
  /** 每句音频占据的帧（不含之后的停顿） */
  lines: TimedLine[];
  /** 从第一句开始到下一个画面开始（最后一个画面到总帧数） */
  scenes: ({ id: string; segment: string } & FrameSpan)[];
  segments: ({ id: string; title: string } & FrameSpan)[];
};

// 句子时长向上取整，保证音频不被截断；停顿四舍五入
const lineFrames = (seconds: number, fps: number) => Math.ceil(seconds * fps);
const pauseFrames = (seconds: number, fps: number) => Math.round(seconds * fps);

export const computeTimeline = (
  manifest: EpisodeManifest,
  pauses: Pauses,
  fps: number,
): Timeline => {
  const lines: TimedLine[] = [];
  let cursor = 0;
  manifest.lines.forEach((line, index) => {
    const previous = manifest.lines[index - 1];
    if (previous) {
      const pause =
        previous.scene === line.scene ? pauses.betweenLines : pauses.sceneChange;
      cursor += pauseFrames(pause, fps);
    }
    const endFrame = cursor + lineFrames(line.seconds, fps);
    lines.push({ ...line, startFrame: cursor, endFrame });
    cursor = endFrame;
  });
  const totalFrames = cursor;

  // 一组连续的区间：每个从它的第一句开始，到下一个的开始（最后一个到总帧数）
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
      endFrame: starts[i + 1] ?? totalFrames,
    }));
  };

  const scenes = spans(manifest.scenes, (scene) =>
    lines.find((line) => line.scene === scene.id),
  );
  const segments = spans(manifest.segments, (segment) => {
    const scene = scenes.find((s) => s.segment === segment.id);
    return scene && lines.find((line) => line.scene === scene.id);
  });
  return { fps, totalFrames, lines, scenes, segments };
};

/** 第 `frame` 帧时字幕框显示的旁白句：配音开始时出现，到下一句开始时切换 */
export const lineAt = (timeline: Timeline, frame: number): TimedLine | undefined =>
  timeline.lines.findLast((line) => line.startFrame <= frame);
