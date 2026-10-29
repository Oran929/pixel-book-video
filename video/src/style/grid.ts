// 组件摆放的粗网格（#34）：字幕框上方的 12 列 × 6 行。
// 纯 .ts、不引用 React/remotion：分镜校验（Node 里运行）和组件渲染都用它。
import { GRID, LINE_HEIGHT, SIZE } from "./style";

/** 网格的列数和行数 */
export const LAYOUT = { columns: 12, rows: 6 } as const;

/** `[列, 行]`：左上角所在的格，或占几格（列数, 行数），都从 0 开始数格 */
export type GridPoint = readonly [number, number];

export type LayoutGrid = {
  columns: number;
  rows: number;
  /** 每格的宽和高（屏幕像素），都是像素网格 `GRID` 的整数倍 */
  cellWidth: number;
  cellHeight: number;
  /** 第 0 列的左沿、第 0 行的上沿（屏幕像素） */
  left: number;
  top: number;
};

/** 左上角主题占的高度：上边距 + 一行字幕字号的行高（EpisodeTitle） */
const titleBottom = SIZE.margin + LINE_HEIGHT.subtitle;

/**
 * 字幕框从画面下沿往上占的高度：下边距 + 内描边 ×2 + 上下内边距 + 一行行高 + 外描边
 * （外描边是 CSS outline，不占布局，但画在框外，网格要让开）。字幕最多 20 字，总是一行。
 */
const subtitleTop = (height: number) =>
  height -
  SIZE.margin -
  (2 * SIZE.stroke + 2 * SIZE.subtitlePaddingY + LINE_HEIGHT.subtitle) -
  SIZE.stroke;

const floorToGrid = (value: number) => Math.floor(value / GRID) * GRID;

/**
 * 网格区域：横向是去掉左右安全边距的画面宽，纵向从主题下沿到字幕框外描边上沿。
 * 区域等分成 `LAYOUT.columns × LAYOUT.rows` 格，每格的宽和高向下对齐到像素网格，
 * 余下的像素平均分到两侧（每侧也向下对齐到像素网格）。
 */
export const layoutGrid = (width: number, height: number): LayoutGrid => {
  const areaWidth = width - 2 * SIZE.margin;
  const areaHeight = subtitleTop(height) - titleBottom;
  const cellWidth = floorToGrid(areaWidth / LAYOUT.columns);
  const cellHeight = floorToGrid(areaHeight / LAYOUT.rows);
  return {
    ...LAYOUT,
    cellWidth,
    cellHeight,
    left: SIZE.margin + floorToGrid((areaWidth - cellWidth * LAYOUT.columns) / 2),
    top: titleBottom + floorToGrid((areaHeight - cellHeight * LAYOUT.rows) / 2),
  };
};

/** 从 `at` 格起、占 `cells` 格的矩形（屏幕像素） */
export const cellRect = (grid: LayoutGrid, at: GridPoint, cells: GridPoint) => ({
  x: grid.left + at[0] * grid.cellWidth,
  y: grid.top + at[1] * grid.cellHeight,
  width: cells[0] * grid.cellWidth,
  height: cells[1] * grid.cellHeight,
});
