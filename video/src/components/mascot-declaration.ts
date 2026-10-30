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

export const MascotDeclaration = declareComponent({
  effect: "Q 版频道小人，一个或一群，头顶能冒问号或感叹号",
  suitedFor: "人物做什么：一群上师和大神、程序员头顶冒问题、恍然大悟",
  docs: {
    title: "小人",
    example: { id: "host", props: { character: "reader" }, at: [0, 1] },
    params: {
      character:
        "Q 版角色，按外观起名（见风格表 `MASCOTS`）；一群人时可以写一串，从左往右一人一个，不够时从头循环",
      count: "几个人，不写是 1",
      formation: "排法，不写是 `row`",
    },
    paramNotes: [
      "一群人的写法：",
      "",
      "```json",
      '{ "id": "gurus", "component": "Mascot", "props": { "character": ["dragon", "whale", "gothic", "reader"], "count": 5, "formation": "crowd" }, "at": [3, 2] }',
      "```",
    ].join("\n"),
    cells:
      "一个小人 2 列 × 3 行。`row` 每人隔一块格子的宽，占 `2 × 人数` 列 × 3 行（一排最多 6 人占满 12 列）；`crowd` 每人只隔一列、左右挤着有一点遮挡，从 0 数的单数位站后排、比前排高一行、被前排挡住，占 `人数 + 1` 列 × 4 行（只有一个人时和 `row` 一样，2 × 3）。超出网格照常报越界。",
    states: {
      normal: "头顶没东西",
      question: "头顶冒问号",
      exclaim: "头顶冒感叹号",
    },
    stateNotes: "一群人一起冒同一个符号。",
    notes: [
      "- **尺寸**（#42 人工关口，用户选了 1/2 缩小）：图片按原图的 1/2（风格表 `MASCOT_SCALE`、`mascotSize`，四舍五入到整数像素）、最近邻插值显示，约 187–220 × 280–296 像素。一个小人的格数由 `mascotCells()` 算：最宽、最高的角色按显示尺寸向上取整到整格，高度还要放下头顶的符号；在自己那块格子里底边对齐、水平居中。",
      "- **符号**：从下面升上来、淡入（一个通用动画的时长），之后每 0.5 秒（`MOTION.mascotSymbolBobSeconds`）上下浮动一格像素；切回 `normal` 时原地淡出。符号是风格表 `MASCOT_SYMBOLS` 里的 5×7 点阵（每点 `SIZE.mascotSymbolDot`，外面一圈 `ink` 描边），不是字体里的「？」「！」（组件不渲染参数以外的固定文字）；颜色 `COLOR.mascotQuestion`（黄）、`COLOR.mascotExclaim`（红）。符号画在小人自己的格子里，不压到上面的组件（`mascot-look.test.ts` 检查）。",
      "- 图片不是对齐网格的像素画，1/2 后「像素」大小不一，1 像素宽的描边有些地方断续（用户看过样帧认可）。图片是从 `character/Q.png` 裁出的透明底 PNG（`video/public/character/`，裁图脚本 `character/crop_q.py`）。",
    ].join("\n"),
    sample:
      "四个角色四种入场和退场动画；一个小人冒问号、换感叹号、切回；三人一排一起冒问号，五人一群一起冒感叹号。",
  },
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
