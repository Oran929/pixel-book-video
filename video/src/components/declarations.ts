import { z } from "zod";
import { layoutGrid } from "../style/grid";
import { BLOCK_COLORS, FONT_SIZE, MASCOTS, MOTION, SIZE } from "../style/style";
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

/** 提示牌占几格：一行标题牌（「提示14」）加一行大号标题 */
export const HINT_CELLS = [5, 3] as const;

/** 提示牌的字号：标题牌上的「提示14」用 `HINT_FONT.header`，提示标题用 `HINT_FONT.title` */
export const HINT_FONT = { header: "subtitle", title: "large" } as const;

/**
 * 提示牌里放字的宽度（屏幕像素）：格子宽，减去两侧粗描边、右下的硬阴影和两侧内边距
 * （和知识块同一个口径）
 */
export const hintTextRoom = (): number =>
  HINT_CELLS[0] * layoutGrid(VIDEO.width, VIDEO.height).cellWidth -
  2 * SIZE.strokeThick -
  SIZE.shadowOffset -
  2 * SIZE.blockPadding;

/** HintSign：书里的提示框，标题牌上是「提示」和编号，下面是提示标题；入场默认「亮起」 */
export const HintSignProps = z
  .strictObject({
    /** 标题牌上编号前的字，通常是「提示」。显示文字 */
    label: displayText(z.string().min(1)),
    /** 提示的编号，例如 "14"。显示文字：画面说明里写了「提示14」才能用 */
    number: displayText(z.string().min(1)),
    /** 提示标题，例如 "ETC"；只有一行。显示文字 */
    title: displayText(z.string().min(1)),
  })
  .superRefine(({ label, number, title }, ctx) => {
    const room = hintTextRoom();
    const header =
      textWidth(label, FONT_SIZE[HINT_FONT.header]) +
      SIZE.blockPadding +
      textWidth(number, FONT_SIZE[HINT_FONT.header]);
    if (header > room) {
      ctx.addIssue({
        code: "custom",
        path: ["label"],
        message: `标题牌「${label} ${number}」估算宽 ${header} 像素，提示牌最多放 ${room} 像素`,
      });
    }
    const width = textWidth(title, FONT_SIZE[HINT_FONT.title]);
    if (width > room) {
      ctx.addIssue({
        code: "custom",
        path: ["title"],
        message: `标题「${title}」估算宽 ${width} 像素，提示牌最多放 ${room} 像素：缩短标题`,
      });
    }
  });

/** 电脑占几格：显示器加底座 */
export const COMPUTER_CELLS = [4, 4] as const;

/** 电脑屏幕上的字号和最多几行 */
export const COMPUTER_FONT = "subtitle" as const;
export const COMPUTER_MAX_LINES = 3;

/**
 * 电脑的各部分（相对组件左上角的屏幕像素）：显示器在上，脖子和底座居中在下，
 * 右下留出硬阴影的偏移；屏幕是显示器去掉粗描边和边框
 */
export const computerLayout = () => {
  const grid = layoutGrid(VIDEO.width, VIDEO.height);
  const width = COMPUTER_CELLS[0] * grid.cellWidth - SIZE.shadowOffset;
  const height = COMPUTER_CELLS[1] * grid.cellHeight - SIZE.shadowOffset;
  const monitorHeight = height - SIZE.computerNeckHeight - SIZE.computerBaseHeight;
  const inset = SIZE.strokeThick + SIZE.computerBezel;
  return {
    monitor: { x: 0, y: 0, width, height: monitorHeight },
    screen: {
      x: inset,
      y: inset,
      width: width - 2 * inset,
      height: monitorHeight - 2 * inset,
    },
    neck: {
      x: (width - SIZE.computerNeckWidth) / 2,
      y: monitorHeight,
      width: SIZE.computerNeckWidth,
      height: SIZE.computerNeckHeight,
    },
    base: {
      x: (width - SIZE.computerBaseWidth) / 2,
      y: monitorHeight + SIZE.computerNeckHeight,
      width: SIZE.computerBaseWidth,
      height: SIZE.computerBaseHeight,
    },
  };
};

/** 屏幕上一行字能放多宽：屏幕宽减去两侧内边距，再让出崩溃后最后一行往右错开的距离 */
export const computerLineRoom = (): number =>
  computerLayout().screen.width -
  2 * SIZE.blockPadding -
  (COMPUTER_MAX_LINES - 1) * SIZE.computerSlip;

/** 电脑的状态：正常、崩溃 */
export const COMPUTER_STATES = ["normal", "crashed"] as const;
export type ComputerState = (typeof COMPUTER_STATES)[number];

/** Computer：一台老式电脑，屏幕上显示几行字；切到崩溃时抖动、闪屏，停在蓝屏 */
export const ComputerProps = z.strictObject({
  /** 屏幕上的字，一项一行，最多三行，可以不写字（空数组）。显示文字：逐行检查 */
  screen: displayText(
    z
      .array(z.string().min(1))
      .max(COMPUTER_MAX_LINES)
      .superRefine((lines, ctx) => {
        const room = computerLineRoom();
        lines.forEach((line, i) => {
          const width = textWidth(line, FONT_SIZE[COMPUTER_FONT]);
          if (width > room) {
            ctx.addIssue({
              code: "custom",
              path: [i],
              message: `屏幕上的「${line}」估算宽 ${width} 像素，屏幕最多放 ${room} 像素：缩短或拆成两行`,
            });
          }
        });
      }),
  ),
});

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
  HintSign: declareComponent({
    props: HintSignProps,
    states: ["normal"],
    cells: () => HINT_CELLS,
    // 整块提示牌都是字，不让子组件嵌进来
    labelArea: () => ({ at: [0, 0], cells: HINT_CELLS }),
    // 亮起：闪两下再亮住；退场写 `light` 时倒着播，即熄灭
    effects: { light: MOTION.hintLightSeconds },
    enter: "light",
    exit: "fade",
    connector: false,
    sounds: { enter: "ding", exit: "leave", states: { normal: null } },
  }),
  Computer: declareComponent({
    props: ComputerProps,
    states: COMPUTER_STATES,
    cells: () => COMPUTER_CELLS,
    // 上面三行格是屏幕和屏幕上的字，子组件只能嵌在底座那一行
    labelArea: () => ({ at: [0, 0], cells: [COMPUTER_CELLS[0], COMPUTER_CELLS[1] - 1] }),
    enter: "fade",
    exit: "fade",
    connector: false,
    // 出现时弹一声，崩溃时爆一声，重启回正常时轻点一声
    sounds: { enter: "pop", exit: "leave", states: { normal: "blip", crashed: "crash" } },
  }),
} as const satisfies ComponentDeclarations;
