import { describe, expect, it } from "vitest";
import { layoutGrid } from "../style/grid";
import { MASCOTS, type MascotName, SIZE } from "../style/style";
import { VIDEO } from "../video-config";
import { mascotGroup } from "./declarations";
import { mascotPlacement } from "./mascot-look";

// 小人和头顶符号（#42）都画在组件自己的格子里，不压到旁边的组件
describe("mascotPlacement", () => {
  const grid = layoutGrid(VIDEO.width, VIDEO.height);
  const names = Object.keys(MASCOTS) as MascotName[];

  it.each([
    ["row", 1],
    ["row", 6],
    ["crowd", 2],
    ["crowd", 7],
  ] as const)("%s of %i: every mascot and its symbol (bobbing up) stays inside the cells", (formation, count) => {
    const props = { character: names, count, formation };
    const [columns, rows] = mascotGroup(props).cells;
    const inside = mascotPlacement(props).every(
      ({ image, symbol }) =>
        image.x >= 0 &&
        image.x + image.width <= columns * grid.cellWidth &&
        image.y + image.height <= rows * grid.cellHeight &&
        symbol.y - SIZE.mascotSymbolBob >= 0 &&
        symbol.x >= 0 &&
        symbol.x + symbol.width <= columns * grid.cellWidth,
    );
    expect(inside).toBe(true);
  });

  it("stands everyone on the bottom of their own block, the back rank one row higher", () => {
    const placed = mascotPlacement({ character: "reader", count: 3, formation: "crowd" });
    const bottoms = placed.map(({ back, image }) => [back, image.y + image.height]);
    // 后排（第 2 个人）先画；前排底边在第 4 行的下沿，后排在第 3 行的下沿
    expect(bottoms).toEqual([
      [true, 3 * grid.cellHeight],
      [false, 4 * grid.cellHeight],
      [false, 4 * grid.cellHeight],
    ]);
  });
});
