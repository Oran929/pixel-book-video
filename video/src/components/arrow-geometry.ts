// 箭头的几何（#40）：从两端组件的矩形算出箭杆的起点和箭头尖的位置。
// 纯 .ts、不引用 React/remotion。
import type { Rect } from "../style/grid";
import { SIZE, snapToGrid } from "../style/style";

export type Point = { x: number; y: number };

const center = ({ x, y, width, height }: Rect): Point => ({
  x: x + width / 2,
  y: y + height / 2,
});

/** 从矩形中心沿单位向量 `(ux, uy)` 走到矩形边上要走多远 */
const toEdge = ({ width, height }: Rect, ux: number, uy: number) =>
  Math.min(
    ux === 0 ? Infinity : width / 2 / Math.abs(ux),
    uy === 0 ? Infinity : height / 2 / Math.abs(uy),
  );

/**
 * 箭头沿两端中心的连线画：从起点组件的边框外 `SIZE.arrowGap` 处出发，
 * 尖停在终点组件的边框外 `SIZE.arrowGap` 处；坐标取整到像素网格。
 * 两端挨得太近、放不下一个箭头头时返回 null（不画）。
 */
export const arrowLine = (from: Rect, to: Rect): { start: Point; tip: Point } | null => {
  const [a, b] = [center(from), center(to)];
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  if (distance === 0) return null;
  const [ux, uy] = [(b.x - a.x) / distance, (b.y - a.y) / distance];
  const startAt = toEdge(from, ux, uy) + SIZE.arrowGap;
  const tipAt = distance - toEdge(to, ux, uy) - SIZE.arrowGap;
  if (tipAt - startAt < SIZE.arrowHeadLength) return null;
  const at = (t: number): Point => ({
    x: snapToGrid(a.x + ux * t),
    y: snapToGrid(a.y + uy * t),
  });
  return { start: at(startAt), tip: at(tipAt) };
};

/**
 * 画到进度 `shown`（0 → 1）时的箭头：箭杆从起点长出去，箭头头跟着尖走；
 * 返回箭杆的两端和箭头头三角形的三个顶点。
 */
export const arrowShape = (
  { start, tip }: { start: Point; tip: Point },
  shown: number,
) => {
  const length = Math.hypot(tip.x - start.x, tip.y - start.y);
  const [ux, uy] = [(tip.x - start.x) / length, (tip.y - start.y) / length];
  const reach = Math.max(SIZE.arrowHeadLength, length * shown);
  const now = { x: start.x + ux * reach, y: start.y + uy * reach };
  const base = {
    x: now.x - ux * SIZE.arrowHeadLength,
    y: now.y - uy * SIZE.arrowHeadLength,
  };
  const [nx, ny] = [-uy * SIZE.arrowHeadHalfWidth, ux * SIZE.arrowHeadHalfWidth];
  return {
    shaft: { from: start, to: base },
    head: [now, { x: base.x + nx, y: base.y + ny }, { x: base.x - nx, y: base.y - ny }],
  };
};
