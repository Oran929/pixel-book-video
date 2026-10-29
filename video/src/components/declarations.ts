import { z } from "zod";
import { layoutGrid } from "../style/grid";
import { BLOCK_COLORS, FONT_SIZE, MASCOTS, SIZE } from "../style/style";
import { textWidth } from "../style/text-width";
import { VIDEO } from "../video-config";
import {
  type ComponentDeclarations,
  declareComponent,
  displayText,
} from "./declaration";

// 各组件的声明（参数格式、状态、占几格、默认动画、默认音效）。单独放在不含 JSX、
// 不引用 remotion 的文件里，这样时间轴导出命令（Node 里运行）校验分镜时
// 不用加载 React 组件。组件实现在 registry.ts 里按同样的名字登记。

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
    size: z.enum(
      Object.keys(BLOCK_SIZES) as [BlockSize, ...BlockSize[]],
    ),
    /** 颜色：风格表 `BLOCK_COLORS` 里的名字 */
    color: z.enum(
      Object.keys(BLOCK_COLORS) as [BlockColor, ...BlockColor[]],
    ),
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

/** Mascot：一个 Q 版频道小人，站在分镜 `at` 给的格子里，分镜里需要"人物做什么"时才用 */
export const MascotProps = z.strictObject({
  /** 哪个 Q 版角色，按外观起名（见风格表 `MASCOTS`） */
  character: z.enum(
    Object.keys(MASCOTS) as [keyof typeof MASCOTS, ...(keyof typeof MASCOTS)[]],
  ),
});

/** 箭头的状态：正常、高亮（「改一处要连带改三处」时点亮连线） */
export const ARROW_STATES = ["normal", "highlight"] as const;
export type ArrowState = (typeof ARROW_STATES)[number];

/** Arrow：从一个组件指向另一个组件；两端写在分镜的 `from`、`to` 上，没有参数 */
export const ArrowProps = z.strictObject({});

/** 组件名 → 声明；交给 `planEpisode` 核对组件名、参数、状态，并取默认动画 */
export const COMPONENT_DECLARATIONS = {
  PixelBlock: declareComponent({
    props: PixelBlockProps,
    states: BLOCK_STATES,
    cells: ({ size }) => BLOCK_SIZES[size].cells,
    // 标签横贯整个方块，占 `labelRows` 那几行；子组件只能嵌在标签以外的行里
    labelArea: ({ size }) => {
      const { cells, labelRows } = BLOCK_SIZES[size];
      return { at: [0, labelRows[0]], cells: [cells[0], labelRows[1]] };
    },
    enter: "slide",
    exit: "fade",
    connector: false,
    // 落下一声；被点到轻点一声，被改动嗡一声，切回正常也轻点一声
    sounds: {
      enter: "drop",
      exit: "leave",
      states: { normal: "blip", highlight: "blip", changed: "buzz" },
    },
  }),
  Mascot: declareComponent({
    props: MascotProps,
    states: ["normal"],
    // 原尺寸约 400×590 像素，暂按 3 列 × 5 行；小人的尺寸由 #42 决定
    cells: () => [3, 5],
    enter: "fade",
    exit: "fade",
    connector: false,
    sounds: { enter: "pop", exit: "leave", states: { normal: null } },
  }),
  Arrow: declareComponent({
    props: ArrowProps,
    states: ARROW_STATES,
    // 连线类组件不按格子摆放，不占格
    cells: () => [0, 0],
    enter: "fade",
    exit: "fade",
    connector: true,
    // 出现时弹一声；高亮、切回正常都轻点一声
    sounds: {
      enter: "pop",
      exit: "leave",
      states: { normal: "blip", highlight: "blip" },
    },
  }),
} as const satisfies ComponentDeclarations;
