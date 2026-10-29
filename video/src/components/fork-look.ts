// 岔路各状态的样子（#43）：从舞台信息算出这一帧每条路是什么颜色、标出的那条路亮到哪、
// 路障在哪条路上、落到哪。纯 .ts：Fork.tsx 里不写 0、1 以外的数字（style/hardcoded.test.ts）。
import type { Rect } from "../style/grid";
import { COLOR, MOTION, SIZE, snapToGrid } from "../style/style";
import { VIDEO } from "../video-config";
import { forkRoadOf } from "./declarations";
import type { Stage } from "./stage";

/** 一条路这一帧的样子 */
export type RoadLook = {
  /** 标出这条路时，黄色路面从路口往右铺到哪（0 → 1）；没标出时为 0 */
  marked: number;
  /** 路障：相对立好的位置往上偏多少（屏幕像素，像素网格的整数倍）；这条路上没有路障时为 null */
  barrier: { lift: number } | null;
};

const progress = (stateFrames: number) =>
  Math.min(1, stateFrames / Math.max(1, Math.round(MOTION.animationSeconds * VIDEO.fps)));

/**
 * 岔路这一帧每条路的样子（从上往下）。`mark-N`：第 N 条路的路面从路口往右一路铺成黄色。
 * `block-N`：路障从上方落到第 N 条路上。从 `block-N` 切走：路障往上抬起、消失。
 * 都用一个通用动画的时长。
 */
export const forkLook = (stage: Stage, roads: number): RoadLook[] => {
  const t = progress(stage.stateFrames);
  const current = forkRoadOf(stage.state);
  const previous = stage.previousState === null ? null : forkRoadOf(stage.previousState);
  return Array.from({ length: roads }, (_, k) => {
    const road = k + 1;
    const markedHere = current?.kind === "mark" && current.road === road;
    const blockedHere = current?.kind === "block" && current.road === road;
    const wasBlockedHere = previous?.kind === "block" && previous.road === road;
    let barrier: RoadLook["barrier"] = null;
    if (blockedHere) {
      barrier = { lift: wasBlockedHere ? 0 : snapToGrid((1 - t) * SIZE.slideDistance) };
    } else if (wasBlockedHere && t < 1) {
      barrier = { lift: snapToGrid(t * SIZE.slideDistance) };
    }
    return { marked: markedHere ? t : 0, barrier };
  });
};

/** 路障横杆的红白斜条纹（CSS 背景），条纹宽取自风格表 */
export const barrierStripes = (): string =>
  `repeating-linear-gradient(135deg, ${COLOR.forkBarrier} 0 ${SIZE.forkBarrierStripe}px, ${COLOR.forkBarrierStripe} ${SIZE.forkBarrierStripe}px ${2 * SIZE.forkBarrierStripe}px)`;

/** 路中间的虚线（CSS 背景）：一段线、一段空 */
export const roadDashes = (): string =>
  `repeating-linear-gradient(90deg, ${COLOR.forkRoadLine} 0 ${SIZE.forkDash}px, transparent ${SIZE.forkDash}px ${SIZE.forkDash + SIZE.forkDashGap}px)`;

/** 往外扩一圈的矩形：几段路先整体画一层描边色，再画路面，接缝处就没有描边 */
export const grow = ({ x, y, width, height }: Rect, by: number): Rect => ({
  x: x - by,
  y: y - by,
  width: width + 2 * by,
  height: height + 2 * by,
});

/** 往右下平移 `by` 的矩形（硬阴影） */
export const shift = ({ x, y, width, height }: Rect, by: number): Rect => ({
  x: x + by,
  y: y + by,
  width,
  height,
});

/** 一段路中间的虚线：横贯 `from` 到 `to`，竖直方向在路的正中 */
export const dashes = (road: Rect, from: number, to: number): Rect => ({
  x: from,
  y: road.y + (road.height - SIZE.forkDashHeight) / 2,
  width: Math.max(0, to - from),
  height: SIZE.forkDashHeight,
});

