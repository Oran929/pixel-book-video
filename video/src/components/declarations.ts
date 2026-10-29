import { z } from "zod";
import { layoutGrid, type Rect } from "../style/grid";
import {
  BLOCK_COLORS,
  FONT_SIZE,
  MASCOT_SYMBOLS,
  MASCOTS,
  type MascotName,
  MOTION,
  mascotSize,
  SIZE,
  snapToGrid,
} from "../style/style";
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

const MASCOT_NAMES = Object.keys(MASCOTS) as [MascotName, ...MascotName[]];

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

/** 屏幕上一行字能放多宽：屏幕宽减去两侧内边距（崩溃后字只往下错开，不占横向） */
export const computerLineRoom = (): number =>
  computerLayout().screen.width - 2 * SIZE.blockPadding;

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

/** 岔路占几格：左边一段路进路口，往右分出几条路 */
export const FORK_CELLS = [6, 4] as const;

/** 岔路最少、最多几条路 */
export const FORK_ROADS = { min: 2, max: 4 } as const;

/** 岔路标签的字号 */
export const FORK_FONT = "subtitle" as const;

/**
 * 岔路的状态：`normal` 什么都没有；`mark-N` 标出第 N 条路（从上往下数，从 1 起）；
 * `block-N` 在第 N 条路上放路障。一次只处在一个状态：从 `block-N` 切到别的状态就是撤掉路障。
 * 每种情况单独声明一个状态（不用带参数的状态名），分镜照常写 `state`；
 * 路的序号超出这组参数的条数时，`availableStates` 让分镜检查报错。
 */
export const FORK_STATES = [
  "normal",
  "mark-1",
  "mark-2",
  "mark-3",
  "mark-4",
  "block-1",
  "block-2",
  "block-3",
  "block-4",
] as const;
export type ForkState = (typeof FORK_STATES)[number];

/** 岔路状态里的路：`mark-2` → 标出第 2 条路；`normal` → null */
export const forkRoadOf = (
  state: string,
): { kind: "mark" | "block"; road: number } | null => {
  const match = /^(mark|block)-(\d+)$/u.exec(state);
  return match ? { kind: match[1] as "mark" | "block", road: Number(match[2]) } : null;
};

/**
 * 岔路的各部分（相对组件左上角的屏幕像素，都不含描边）：左边一段进路口的路（trunk），
 * 分岔的竖路（spine），往右的几条路（roads，从上往下）；每条路上路障立的位置和标签的位置。
 * 右下留出硬阴影的偏移。
 */
export const forkLayout = (roads: number) => {
  const grid = layoutGrid(VIDEO.width, VIDEO.height);
  const width = FORK_CELLS[0] * grid.cellWidth - SIZE.shadowOffset;
  const height = FORK_CELLS[1] * grid.cellHeight - SIZE.shadowOffset;
  const road = SIZE.forkRoad;
  // 外框描边（细描边，路挨得近）画在路面外面，路面整体往里收一圈描边
  const inset = SIZE.stroke;
  const centers = Array.from({ length: roads }, (_, k) =>
    snapToGrid(inset + ((height - 2 * inset) * (2 * k + 1)) / (2 * roads)),
  );
  const spineX = inset + SIZE.forkTrunk;
  const roadX = spineX + road;
  const right = width - inset;
  const middle = snapToGrid(height / 2);
  const barrierX = roadX + 2 * SIZE.blockPadding;
  const labelX = barrierX + SIZE.forkBarrierWidth + 2 * SIZE.blockPadding;
  return {
    width,
    height,
    trunk: { x: inset, y: middle - road / 2, width: SIZE.forkTrunk + road, height: road },
    spine: {
      x: spineX,
      y: centers[0]! - road / 2,
      width: road,
      height: centers.at(-1)! - centers[0]! + road,
    },
    roads: centers.map((center) => ({
      road: { x: spineX, y: center - road / 2, width: right - spineX, height: road },
      barrier: {
        x: barrierX,
        y: center - road / 2 - SIZE.forkBarrierOverhang,
        width: SIZE.forkBarrierWidth,
        height: road + 2 * SIZE.forkBarrierOverhang,
      },
      label: {
        x: labelX,
        y: center - road / 2,
        width: right - SIZE.blockPadding - labelX,
        height: road,
      },
    })),
  } satisfies Record<string, unknown> & { trunk: Rect; spine: Rect };
};

/** 岔路上一条路的标签能放多宽：路障右边到路的右端（再留一个内边距） */
export const forkLabelRoom = (): number => forkLayout(FORK_ROADS.max).roads[0]!.label.width;

/** Fork：一个路口加几条路；可以标出某条路，可以给某条路放上或撤掉路障 */
export const ForkProps = z
  .strictObject({
    /** 几条路 */
    roads: z.int().min(FORK_ROADS.min).max(FORK_ROADS.max),
    /** 每条路的标签，从上往下一项一条路，项数等于 `roads`；不写就是不带字的路。显示文字：逐项检查 */
    labels: displayText(z.array(z.string().min(1))).optional(),
  })
  .superRefine(({ roads, labels }, ctx) => {
    if (labels === undefined) return;
    if (labels.length !== roads) {
      ctx.addIssue({
        code: "custom",
        path: ["labels"],
        message: `labels 有 ${labels.length} 项，要和 roads（${roads} 条路）一样多`,
      });
    }
    const room = forkLabelRoom();
    labels.forEach((label, i) => {
      const width = textWidth(label, FONT_SIZE[FORK_FONT]);
      if (width > room) {
        ctx.addIssue({
          code: "custom",
          path: ["labels", i],
          message: `路上的标签「${label}」估算宽 ${width} 像素，最多放 ${room} 像素：缩短标签`,
        });
      }
    });
  });

/** 时间线最少、最多几个节点；每个节点占几列 */
export const TIMELINE_NODES = { min: 2, max: 6, columns: 2 } as const;

/** 时间线占几格：每个节点 2 列；上一行是横轴和节点，下一行是节点下面的字 */
export const timelineCells = (nodes: number) =>
  [nodes * TIMELINE_NODES.columns, 2] as const;

/** 时间线节点文字的字号 */
export const TIMELINE_FONT = "subtitle" as const;

/**
 * 时间线的状态：`normal` 一个都没点亮；`lit-N` 点亮了前 N 个节点（从左往右，从 1 起）。
 * 点亮到第 N 个时从上一个状态点亮到的地方沿横轴一路亮过去。
 * 和岔路一样每种情况单独声明一个状态，节点序号超出这组参数的节点数时分镜检查报错。
 */
export const TIMELINE_STATES = [
  "normal",
  "lit-1",
  "lit-2",
  "lit-3",
  "lit-4",
  "lit-5",
  "lit-6",
] as const;
export type TimelineState = (typeof TIMELINE_STATES)[number];

/** 时间线状态点亮了几个节点：`lit-3` → 3，`normal` → 0 */
export const timelineLitOf = (state: string): number => {
  const match = /^lit-(\d+)$/u.exec(state);
  return match ? Number(match[1]) : 0;
};

/**
 * 时间线的各部分（相对组件左上角的屏幕像素）：第一行正中一条横轴，
 * 每个节点在自己那两列的正中；第二行是节点下面的字。
 */
export const timelineLayout = (nodes: number) => {
  const grid = layoutGrid(VIDEO.width, VIDEO.height);
  const [columns] = timelineCells(nodes);
  const width = columns * grid.cellWidth - SIZE.shadowOffset;
  const slot = TIMELINE_NODES.columns * grid.cellWidth;
  const axisY = snapToGrid(grid.cellHeight / 2);
  const node = SIZE.timelineNode;
  const centers = Array.from({ length: nodes }, (_, k) => snapToGrid(k * slot + slot / 2));
  return {
    width,
    axis: { x: 0, y: axisY - SIZE.timelineAxis / 2, width, height: SIZE.timelineAxis },
    centers,
    nodes: centers.map((x) => ({ x: x - node / 2, y: axisY - node / 2, width: node, height: node })),
    labels: centers.map((x) => ({
      x: x - slot / 2 + SIZE.blockPadding,
      y: grid.cellHeight,
      width: slot - 2 * SIZE.blockPadding,
      height: grid.cellHeight - SIZE.shadowOffset,
    })),
  };
};

/** 时间线一个节点下面的字能放多宽：节点那两列，减去两侧内边距 */
export const timelineLabelRoom = (): number => timelineLayout(TIMELINE_NODES.min).labels[0]!.width;

/** Timeline：一条横轴加几个带字的节点，节点可以逐个点亮 */
export const TimelineProps = z.strictObject({
  /** 节点下面的字，从左往右一项一个节点。显示文字：逐项检查 */
  nodes: displayText(
    z
      .array(z.string().min(1))
      .min(TIMELINE_NODES.min)
      .max(TIMELINE_NODES.max)
      .superRefine((nodes, ctx) => {
        const room = timelineLabelRoom();
        nodes.forEach((node, i) => {
          const width = textWidth(node, FONT_SIZE[TIMELINE_FONT]);
          if (width > room) {
            ctx.addIssue({
              code: "custom",
              path: [i],
              message: `节点「${node}」估算宽 ${width} 像素，一个节点最多放 ${room} 像素：缩短`,
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
    states: MASCOT_STATES,
    cells: (props) => mascotGroup(props).cells,
    enter: "fade",
    exit: "fade",
    connector: false,
    // 出现时弹一声；冒问号轻点一声，冒感叹号叮一声，符号消失（切回正常）不放音效
    sounds: {
      enter: "pop",
      exit: "leave",
      states: { normal: null, question: "blip", exclaim: "ding" },
    },
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
  Fork: declareComponent({
    props: ForkProps,
    states: FORK_STATES,
    cells: () => FORK_CELLS,
    // 路上写了字时整块岔路都算标签（字在路的右段，路占满上下）；不写字时子组件可以嵌进来
    labelArea: ({ labels }) =>
      labels ? { at: [0, 0], cells: FORK_CELLS } : { at: [0, 0], cells: [0, 0] },
    availableStates: ({ roads }) =>
      FORK_STATES.filter((state) => (forkRoadOf(state)?.road ?? 0) <= roads),
    enter: "fade",
    exit: "fade",
    connector: false,
    // 出现时弹一声；标出一条路轻点一声，路障落下一声，撤掉路障（切回正常）轻点一声
    sounds: {
      enter: "pop",
      exit: "leave",
      states: Object.fromEntries(
        FORK_STATES.map((state) => [
          state,
          forkRoadOf(state)?.kind === "block" ? "drop" : "blip",
        ]),
      ) as Record<ForkState, "drop" | "blip">,
    },
  }),
  Timeline: declareComponent({
    props: TimelineProps,
    states: TIMELINE_STATES,
    cells: ({ nodes }) => timelineCells(nodes.length),
    // 下一行是节点下面的字，子组件只能嵌在横轴那一行
    labelArea: ({ nodes }) => ({ at: [0, 1], cells: [timelineCells(nodes.length)[0], 1] }),
    availableStates: ({ nodes }) =>
      TIMELINE_STATES.filter((state) => timelineLitOf(state) <= nodes.length),
    enter: "fade",
    exit: "fade",
    connector: false,
    // 出现时弹一声，点亮时叮一声；全部熄灭（切回正常）不放音效
    sounds: {
      enter: "pop",
      exit: "leave",
      states: Object.fromEntries(
        TIMELINE_STATES.map((state) => [state, state === "normal" ? null : "ding"]),
      ) as Record<TimelineState, "ding" | null>,
    },
  }),
} as const satisfies ComponentDeclarations;
