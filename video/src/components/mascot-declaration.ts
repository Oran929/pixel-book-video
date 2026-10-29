import { z } from "zod";
import { layoutGrid } from "../style/grid";
import {
  MASCOT_SYMBOLS,
  MASCOTS,
  type MascotName,
  mascotSize,
  SIZE,
} from "../style/style";
import { VIDEO } from "../video-config";
import { declareComponent, keysOf } from "./declaration";

// 小人 Mascot 的声明、参数格式和尺寸计算（汇总在 declarations.ts）。

/** 小人头顶符号的宽和高（屏幕像素，含描边）：点阵的行列数 × 点的大小，加两侧描边 */
export const mascotSymbolSize = () => {
  const glyphs = Object.values(MASCOT_SYMBOLS);
  const dots = (count: number) => count * SIZE.mascotSymbolDot + 2 * SIZE.mascotSymbolOutline;
  return {
    width: dots(Math.max(...glyphs.map((rows) => rows[0].length))),
    height: dots(Math.max(...glyphs.map((rows) => rows.length))),
  };
};

/**
 * 一个小人占几格：所有角色里最宽、最高的那个按显示尺寸（风格表 `mascotSize`，原图的 1/2）
 * 向上取整到整格；高度还要放下头顶的符号（含离头的空隙和往上浮动的幅度），符号不出自己的格子。
 * 1920×1080 下是 2 列 × 3 行。
 */
export const mascotCells = (): readonly [number, number] => {
  const grid = layoutGrid(VIDEO.width, VIDEO.height);
  const sizes = (Object.keys(MASCOTS) as MascotName[]).map(mascotSize);
  const tallest =
    Math.max(...sizes.map((size) => size.height)) +
    SIZE.mascotSymbolGap +
    mascotSymbolSize().height +
    SIZE.mascotSymbolBob;
  return [
    Math.ceil(Math.max(...sizes.map((size) => size.width)) / grid.cellWidth),
    Math.ceil(tallest / grid.cellHeight),
  ];
};

/**
 * 小人的状态：`normal` 头顶没有东西；`question` 头顶冒问号（困惑、在问自己），
 * `exclaim` 头顶冒感叹号（发现、吃惊）。一群小人一起冒同一个符号。
 */
export const MASCOT_STATES = ["normal", "question", "exclaim"] as const;
export type MascotState = (typeof MASCOT_STATES)[number];

const MASCOT_NAMES = keysOf(MASCOTS);

/** 一群小人的排法：`row` 并排一排，`crowd` 挤成前后两排的一群 */
export const MASCOT_FORMATIONS = ["row", "crowd"] as const;
export type MascotFormation = (typeof MASCOT_FORMATIONS)[number];

/**
 * Mascot：Q 版频道小人，一个或一群，站在分镜 `at` 给的格子里；分镜里需要"人物做什么"时才用。
 * 头顶冒问号、感叹号是状态（`MASCOT_STATES`），一群人一起冒。
 */
export const MascotProps = z.strictObject({
  /**
   * 哪个 Q 版角色，按外观起名（见风格表 `MASCOTS`）；一群人时可以写一串，
   * 从左往右一人一个，不够时从头循环
   */
  character: z.union([z.enum(MASCOT_NAMES), z.array(z.enum(MASCOT_NAMES)).min(1)]),
  /** 几个人，不写是 1 */
  count: z.int().min(1).optional(),
  /** 排法，不写是 `row` */
  formation: z.enum(MASCOT_FORMATIONS).optional(),
});

/** 一群小人里的一个人：角色，他那块格子的左上角（相对组件，单位是格），是否站在后排 */
export type MascotMember = { character: MascotName; at: readonly [number, number]; back: boolean };

/**
 * 一群小人占几格、每人站在哪：每人一块 `mascotCells()` 大的格子（2×3），人在格子里底边对齐、水平居中。
 * `row`：一人挨一人，每人隔一块格子的宽，占 `[2 × 人数, 3]`。
 * `crowd`：每人只隔一列，左右挤着有一点遮挡；单数位（从 0 数的 1、3、5…）站后排，
 * 比前排高一行、被前排挡住，占 `[人数 + 1, 4]`。只有一个人时和 `row` 一样。
 */
export const mascotGroup = ({
  character,
  count = 1,
  formation = "row",
}: z.infer<typeof MascotProps>): { cells: readonly [number, number]; members: MascotMember[] } => {
  const [columns, rows] = mascotCells();
  const names = typeof character === "string" ? [character] : character;
  const crowd = formation === "crowd" && count > 1;
  const step = crowd ? 1 : columns;
  return {
    cells: [(count - 1) * step + columns, rows + (crowd ? 1 : 0)],
    members: Array.from({ length: count }, (_, i) => {
      const back = crowd && i % 2 === 1;
      return {
        character: names[i % names.length]!,
        at: [i * step, crowd && !back ? 1 : 0] as const,
        back,
      };
    }),
  };
};

/** Mascot 的声明 */
export const MascotDeclaration = declareComponent({
  props: MascotProps,
  states: MASCOT_STATES,
  cells: (props) => mascotGroup(props).cells,
  enter: "fade",
  // 出现时弹一声；冒问号轻点一声，冒感叹号叮一声，符号消失（切回正常）不放音效
  sounds: {
    enter: "pop",
    states: { normal: null, question: "blip", exclaim: "ding" },
  },
});
