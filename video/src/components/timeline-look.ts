// 时间线各状态的样子（#43）：从舞台信息算出这一帧横轴亮到哪、哪些节点亮着。
// 纯 .ts：Timeline.tsx 里不写 0、1 以外的数字（style/hardcoded.test.ts）。
import { MOTION, snapToGrid } from "../style/style";
import { VIDEO } from "../video-config";
import { timelineLitOf } from "./timeline-declaration";
import type { Stage } from "./stage";

export type TimelineLook = {
  /** 横轴从左端亮到哪（屏幕像素，像素网格的整数倍）；一个都没亮时为 0 */
  axis: number;
  /** 每个节点亮着吗（从左往右） */
  lit: boolean[];
};

/**
 * 时间线这一帧的样子。点亮到第 N 个（`lit-N`）：横轴从上一个状态亮到的地方沿着往右亮过去，
 * 每多一个节点多播一个通用动画的时长，亮光走到哪个节点，哪个节点就亮起。
 * 熄灭（点亮的节点变少，或切回 `normal`）是一下子变的。
 * `centers` 是每个节点中心的横坐标（`timelineLayout(...).centers`）。
 */
export const timelineLook = (stage: Stage, centers: number[]): TimelineLook => {
  const target = timelineLitOf(stage.state);
  const from = stage.previousState === null ? target : timelineLitOf(stage.previousState);
  const reach = (count: number) => (count === 0 ? 0 : centers[count - 1]!);
  let axis = reach(target);
  if (target > from) {
    const frames = Math.max(1, Math.round((target - from) * MOTION.animationSeconds * VIDEO.fps));
    const t = Math.min(1, stage.stateFrames / frames);
    axis = snapToGrid(reach(from) + t * (reach(target) - reach(from)));
  }
  return { axis, lit: centers.map((center, k) => k < target && center <= axis) };
};
