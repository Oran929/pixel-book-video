import { z } from "zod";
import { layoutGrid } from "../style/grid";
import { BLOCK_COLORS, FONT_SIZE, SIZE } from "../style/style";
import { textWidth } from "../style/text-width";
import { VIDEO } from "../video-config";
import { declareComponent, displayText, keysOf, textRoom } from "./declaration";

// 知识块 PixelBlock 的声明、参数格式和尺寸计算（汇总在 declarations.ts）。

/**
 * 知识块的大小 → 占几格、标签用哪个字号、标签占哪几行。标签只有一行，放不下时报错。
 * 2:1 左右的横长条：ep01 的标签多是 2–6 个字（见 #34 的摆放试验）。
 * `labelRows`：标签单行垂直居中，压住的行 `[第几行起, 几行]`（相对方块自己）。
 * 大号方块 372 像素高，字号 96 的行框 128 像素居中，字形落在中间一行里，
 * 上下两行空着，可以嵌子组件（#40）；中号、小号的标签占满整个方块。
 */
export const BLOCK_SIZES = {
  small: { cells: [2, 1], font: "small", labelRows: [0, 1] },
  medium: { cells: [3, 2], font: "subtitle", labelRows: [0, 2] },
  large: { cells: [4, 3], font: "large", labelRows: [1, 1] },
} as const satisfies Record<
  string,
  {
    cells: readonly [number, number];
    font: keyof typeof FONT_SIZE;
    labelRows: readonly [number, number];
  }
>;
export type BlockSize = keyof typeof BLOCK_SIZES;

/**
 * 知识块里放标签的宽度（屏幕像素）：格子宽，减去两侧粗描边、右下的硬阴影和两侧内边距
 */
export const blockLabelRoom = (size: BlockSize): number =>
  BLOCK_SIZES[size].cells[0] * layoutGrid(VIDEO.width, VIDEO.height).cellWidth -
  2 * SIZE.strokeThick -
  SIZE.shadowOffset -
  2 * SIZE.blockPadding;

export type BlockColor = keyof typeof BLOCK_COLORS;

/** 知识块的状态：正常、高亮（被点到）、已改（改过的那一处） */
export const BLOCK_STATES = ["normal", "highlight", "changed"] as const;
export type BlockState = (typeof BLOCK_STATES)[number];

/** PixelBlock：一个带字的像素方块（知识块） */
export const PixelBlockProps = z
  .strictObject({
    /** 方块上的字，例如 "DRY"；只有一行。显示文字：要出自本画面的画面说明或旁白句 */
    label: displayText(z.string().min(1)),
    /** 大小：决定占几格和标签的字号 */
    size: z.enum(keysOf(BLOCK_SIZES)),
    /** 颜色：风格表 `BLOCK_COLORS` 里的名字 */
    color: z.enum(keysOf(BLOCK_COLORS)),
  })
  .superRefine(({ label, size }, ctx) => {
    const width = textWidth(label, FONT_SIZE[BLOCK_SIZES[size].font]);
    const room = blockLabelRoom(size);
    if (width > room) {
      ctx.addIssue({
        code: "custom",
        path: ["label"],
        message: `标签「${label}」估算宽 ${width} 像素，size ${size} 最多放 ${room} 像素：换大一号的 size 或缩短标签`,
      });
    }
  });

export const PixelBlockDeclaration = declareComponent({
  effect: "一个带字的像素方块，从上方落下，可以高亮或标成已改",
  suitedFor: "书里的一个概念、一段知识、一份东西（代码、文档、数据库 Schema）；落下、复制、高亮、只改了一处",
  docs: {
    title: "知识块",
    example: { id: "dry", props: { label: "DRY", size: "medium", color: "orange" }, at: [1, 1] },
    params: {
      label: "方块上的字，一行，单行居中、不换行、不加字距",
      size: "大小，同时决定占几格和标签的字号（见「占几格」）",
      color: "风格表 `BLOCK_COLORS` 里的名字（黄色和红色留给状态）",
    },
    cells: [
      "按 `size`。方块占满格子，右下留出硬阴影的偏移：",
      "",
      "| `size` | 占几格（列 × 行） | 字号 | 标签最多多宽 |",
      "| --- | --- | --- | --- |",
      ...(Object.keys(BLOCK_SIZES) as BlockSize[]).map((size) => {
        const { cells, font } = BLOCK_SIZES[size];
        return `| \`${size}\` | ${cells[0]} × ${cells[1]} | ${FONT_SIZE[font]}（\`FONT_SIZE.${font}\`） | ${textRoom(blockLabelRoom(size), FONT_SIZE[font])} |`;
      }),
      "",
      "标签最多多宽 = 格子宽 − 两侧粗描边 `SIZE.strokeThick` − 硬阴影 `SIZE.shadowOffset` − 两侧内边距 `SIZE.blockPadding`。放不下时报错：换大一号的 `size` 或缩短标签。",
    ].join("\n"),
    states: {
      normal: "深色描边和阴影",
      highlight: "描边和阴影变黄",
      changed: "已改：描边和阴影变红",
    },
    stateNotes: "切到 `highlight`、`changed` 时跳一下（`SIZE.blockHop`，0.4 秒）。",
    animationNotes: "入场的 `slide` 是从上方落下。",
    nesting:
      "`large` 的标签只占中间一行（`[0, 1]` 起 4×1 格；行高 128 像素居中，字形落在中间一行里），上下两行可以嵌子组件；`medium`、`small` 的标签占满整个方块，不能嵌子组件。",
    sample: "三种入场和退场动画；六种颜色；入场、高亮、已改、切回、退场；最后一个画面演嵌套。",
  },
  props: PixelBlockProps,
  states: BLOCK_STATES,
  cells: ({ size }) => BLOCK_SIZES[size].cells,
  // 标签横贯整个方块，占 `labelRows` 那几行；子组件只能嵌在标签以外的行里
  labelArea: ({ size }) => {
    const { cells, labelRows } = BLOCK_SIZES[size];
    return { at: [0, labelRows[0]], cells: [cells[0], labelRows[1]] };
  },
  enter: "slide",
  // 落下一声；被点到轻点一声，被改动嗡一声，切回正常也轻点一声
  sounds: {
    enter: "drop",
    states: { normal: "blip", highlight: "blip", changed: "buzz" },
  },
});
