import { describe, expect, it } from "vitest";
import { cellRect, layoutGrid } from "./grid";

describe("layoutGrid（1920×1080）", () => {
  const grid = layoutGrid(1920, 1080);

  it("是 12 列 × 6 行，每格 148×124，对齐到 4px 的像素网格", () => {
    // 宽：1920 − 2×64 边距 = 1792，÷12 = 149.3 → 148，余 16，两侧各 8
    // 高：主题下沿 64 + 64 = 128，字幕框外描边上沿 1080 − 64 − 136 = 880，
    //     880 − 128 = 752，÷6 = 125.3 → 124，余 8，上下各 4
    expect(grid).toEqual({
      columns: 12,
      rows: 6,
      cellWidth: 148,
      cellHeight: 124,
      left: 72,
      top: 132,
    });
  });

  it("[0, 0] 在左上角主题的下方（主题的行框到 y = 128 为止）", () => {
    expect(cellRect(grid, [0, 0], [1, 1])).toEqual({
      x: 72,
      y: 132,
      width: 148,
      height: 124,
    });
  });

  it("最后一行的下沿在字幕框外描边的上方（y = 880）", () => {
    const { y, height } = cellRect(grid, [0, 5], [12, 1]);
    expect(y + height).toBe(876);
  });
});
