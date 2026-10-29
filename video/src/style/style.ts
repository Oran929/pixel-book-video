// 风格表（票 09）：颜色、像素网格、像素字体、描边和阴影规则。
// 组件（包括常驻组件字幕框和主题）里的颜色、尺寸只能从这里取（style/hardcoded.test.ts 检查）。
// 纯 .ts、不引用 React/remotion：components/declarations.ts 和 Node 里的命令也可以引用。

/**
 * 像素字体：Fusion Pixel 12px，比例宽度，简体（OFL 1.1，来源见 public/fonts/SOURCE.txt）。
 * 字形画在 12×12 的像素格上，字号必须是 `designSize` 的整数倍才不模糊。
 * 字体度量：1200 单位/em，上伸 1300、下伸 300，即一行 16 个字体像素高。
 * 配音流水线的缺字检查用同一个文件（tools/src/pixelbook/pipeline.py 的 SUBTITLE_FONT）。
 */
export const FONT = {
  family: "Fusion Pixel 12px",
  file: "fonts/fusion-pixel-12px-proportional-zh_hans.otf.woff2",
  designSize: 12,
  lineCells: 16,
} as const;

/** 像素网格：画面上一个"像素"占 4×4 个屏幕像素，等于字幕字号下字体的一个像素 */
export const GRID = 4;

/** `cells` 个网格像素的屏幕像素数 */
const cells = (count: number) => count * GRID;

/** 字号：都是字体设计尺寸 12 的整数倍（×2、×4、×8） */
export const FONT_SIZE = {
  small: 24,
  subtitle: 48,
  large: 96,
} as const;

/** 行高：一行 16 个字体像素，保证基线落在整像素上 */
export const LINE_HEIGHT = {
  small: (FONT_SIZE.small / FONT.designSize) * FONT.lineCells,
  subtitle: (FONT_SIZE.subtitle / FONT.designSize) * FONT.lineCells,
  large: (FONT_SIZE.large / FONT.designSize) * FONT.lineCells,
} as const;

/**
 * 像素字体的文字样式：字号、整像素行高；关掉字体平滑，边缘不发虚。
 * 字体由 style/font.ts 在第一帧之前加载。
 */
export const pixelText = (size: keyof typeof FONT_SIZE) =>
  ({
    fontFamily: `"${FONT.family}"`,
    fontSize: FONT_SIZE[size],
    lineHeight: `${LINE_HEIGHT[size]}px`,
    fontWeight: "normal",
    WebkitFontSmoothing: "none",
  }) as const;

/** 调色板：16 色。组件按 `COLOR` 里的用途取色，样张页按这里的顺序展示 */
export const PALETTE = {
  ink: "#2b2b3a",
  slate: "#4a4a5e",
  stone: "#8b8b9a",
  paper: "#f4ecd8",
  sand: "#e3d6b8",
  cream: "#fffaf0",
  orange: "#e07a3f",
  rust: "#a8502a",
  red: "#c8423b",
  yellow: "#f2c14e",
  green: "#5fa55a",
  forest: "#2f6b4f",
  blue: "#3f7cc8",
  navy: "#2a4a8a",
  purple: "#7a5ba8",
  pink: "#e89aa6",
} as const;

/** 用途 → 颜色 */
export const COLOR = {
  background: PALETTE.paper,
  ink: PALETTE.ink,
  subtitleBox: PALETTE.ink,
  subtitleText: PALETTE.paper,
  subtitleBorder: PALETTE.paper,
  accent: PALETTE.orange,
  onAccent: PALETTE.paper,
  episodeTitle: PALETTE.orange,
  /** 知识块「高亮」状态的描边和阴影 */
  highlight: PALETTE.yellow,
  /** 知识块「已改」状态的描边和阴影 */
  changed: PALETTE.red,
  /** 提示牌亮着时的底色（标题牌是 `accent`，上面的字是 `onAccent`，标题是 `ink`） */
  hintBoard: PALETTE.cream,
  /** 提示牌没亮时（亮起之前、熄灭之后）的底色和字色 */
  hintUnlit: PALETTE.slate,
  hintUnlitText: PALETTE.stone,
  /** 提示牌亮起那一下外面闪的一圈光 */
  hintGlow: PALETTE.yellow,
  /** 电脑的外壳（显示器和底座），描边和阴影是 `ink` */
  computerCase: PALETTE.sand,
  /** 电脑正常时的屏幕底色和屏幕上的字（连同光标） */
  computerScreen: PALETTE.ink,
  computerText: PALETTE.green,
  /** 电脑崩溃后的屏幕底色和字：蓝屏 */
  computerCrashScreen: PALETTE.blue,
  computerCrashText: PALETTE.paper,
  /** 电脑刚崩溃时屏幕在这两色之间闪，同时冒出横条花屏 */
  computerFlash: PALETTE.red,
  computerFlashAlt: PALETTE.cream,
  /** 岔路的路面（描边是 `ink`）、路中间的虚线、路上的标签 */
  forkRoad: PALETTE.sand,
  forkRoadLine: PALETTE.cream,
  forkLabel: PALETTE.ink,
  /** 岔路上被标出的那条路的路面 */
  forkMarked: PALETTE.yellow,
  /** 路障：红白相间的横杆 */
  forkBarrier: PALETTE.red,
  forkBarrierStripe: PALETTE.cream,
  /** 时间线的横轴：没点亮的一段、点亮的一段 */
  timelineAxis: PALETTE.stone,
  timelineAxisLit: PALETTE.orange,
  /** 时间线的节点（描边是 `ink`）：没点亮、点亮 */
  timelineNode: PALETTE.sand,
  timelineNodeLit: PALETTE.yellow,
  /** 时间线节点下面的字：没点亮、点亮 */
  timelineLabel: PALETTE.stone,
  timelineLabelLit: PALETTE.ink,
  /** 小人头顶的问号、感叹号（描边是 `ink`） */
  mascotQuestion: PALETTE.yellow,
  mascotExclaim: PALETTE.red,
} as const;

/**
 * 知识块可选的颜色（分镜里的 `color` 参数）：底色和标签的颜色。
 * 黄色留给「高亮」、红色留给「已改」的描边，不作底色。
 */
export const BLOCK_COLORS = {
  orange: { fill: PALETTE.orange, text: PALETTE.paper },
  green: { fill: PALETTE.green, text: PALETTE.paper },
  blue: { fill: PALETTE.blue, text: PALETTE.paper },
  purple: { fill: PALETTE.purple, text: PALETTE.paper },
  cream: { fill: PALETTE.cream, text: PALETTE.ink },
  stone: { fill: PALETTE.stone, text: PALETTE.paper },
} as const;

/** 尺寸（屏幕像素）：都是像素网格的整数倍，元素才落在整像素上 */
export const SIZE = {
  /** 画面四周的安全边距 */
  margin: cells(16),
  /** 细描边：字幕框的内外两圈 */
  stroke: cells(2),
  /** 粗描边：组件的外框 */
  strokeThick: cells(4),
  /** 硬阴影向右下的偏移 */
  shadowOffset: cells(4),
  subtitleMinWidth: cells(240),
  subtitlePaddingY: cells(6),
  subtitlePaddingX: cells(12),
  channelPaddingY: cells(2),
  channelPaddingX: cells(4),
  /** 知识块的外框到标签之间的内边距 */
  blockPadding: cells(4),
  /** 知识块切到「高亮」时先跳起多高，再落回原位 */
  blockHop: cells(4),
  /** 落下动画的起点在终点上方多远 */
  slideDistance: cells(40),
  /** 箭头两端离组件边框留的空 */
  arrowGap: cells(4),
  /** 箭头的箭头头：从尖到底边的长度、底边的半宽 */
  arrowHeadLength: cells(10),
  arrowHeadHalfWidth: cells(8),
  /** 提示牌亮起时外面那圈光的宽度 */
  hintGlow: cells(4),
  /** 电脑显示器的边框：外框粗描边到屏幕之间 */
  computerBezel: cells(8),
  /** 电脑显示器下面的脖子和底座 */
  computerNeckWidth: cells(24),
  computerNeckHeight: cells(12),
  computerBaseWidth: cells(72),
  computerBaseHeight: cells(8),
  /** 屏幕上光标方块的宽和高 */
  computerCursorWidth: cells(6),
  computerCursorHeight: cells(10),
  /** 电脑崩溃时花屏横条的高 */
  computerGlitchBar: cells(8),
  /** 电脑崩溃时左右抖动的幅度 */
  computerShake: cells(4),
  /** 崩溃后屏幕上每行字比上一行多往下错开多少 */
  computerSlip: cells(4),
  /** 岔路的路宽（不含两侧描边），放得下一行字幕字号的字形 */
  forkRoad: cells(14),
  /** 岔路左边进路口的那一段路有多长（到分岔的竖路左沿） */
  forkTrunk: cells(48),
  /** 路中间的虚线：每一段的长、段间的空、线的粗细 */
  forkDash: cells(6),
  forkDashGap: cells(6),
  forkDashHeight: cells(2),
  /** 路障横杆的宽、上下各伸出路面多少、红白条纹每条多宽 */
  forkBarrierWidth: cells(12),
  forkBarrierOverhang: cells(6),
  forkBarrierStripe: cells(4),
  /** 时间线横轴的粗细、节点方块的边长 */
  timelineAxis: cells(4),
  timelineNode: cells(16),
  /** 小人头顶符号（`MASCOT_SYMBOLS`）的一个点多大，外面一圈 `ink` 描边多宽 */
  mascotSymbolDot: cells(2),
  mascotSymbolOutline: cells(1),
  /** 符号底边离小人图片上沿多高 */
  mascotSymbolGap: cells(1),
  /** 符号冒出来时从多低的地方升上来；冒出来以后上下浮动的幅度 */
  mascotSymbolRise: cells(4),
  mascotSymbolBob: cells(1),
} as const;

/** 描边规则：实心、不模糊，宽度取 `SIZE.stroke` / `SIZE.strokeThick` */
export const border = (width: number, color: string) =>
  `${width}px solid ${color}`;

/** 阴影规则：只用向右下的硬阴影，不模糊 */
export const hardShadow = (color: string) =>
  `${SIZE.shadowOffset}px ${SIZE.shadowOffset}px 0 ${color}`;

/**
 * 描边字：像素字体加一个字体像素宽的描边，八个方向的硬阴影拼成，边缘和字形一样是方的。
 * 字距加宽两个字体像素，相邻两个字的描边不会粘在一起。
 */
export const outlinedText = (
  size: keyof typeof FONT_SIZE,
  color: string,
  outline: string,
) => {
  const w = FONT_SIZE[size] / FONT.designSize;
  return {
    ...pixelText(size),
    color,
    letterSpacing: 2 * w,
    textShadow: [-w, 0, w]
      .flatMap((x) => [-w, 0, w].map((y) => [x, y]))
      .filter(([x, y]) => x !== 0 || y !== 0)
      .map(([x, y]) => `${x}px ${y}px 0 ${outline}`)
      .join(", "),
  } as const;
};

/** 把位移取整到像素网格，动画过程中元素也不落在半像素上 */
export const snapToGrid = (value: number) => Math.round(value / GRID) * GRID;

/** 动画 */
export const MOTION = {
  /** 组件入场或退场的通用动画（淡入淡出、落下升起）播多少秒；`none` 不播 */
  animationSeconds: 0.4,
  /** 提示牌的「亮起」播多少秒：闪两下再亮住，外面闪一圈光（退场时倒着播，即熄灭） */
  hintLightSeconds: 0.8,
  /** 电脑切到崩溃时抖动、闪屏、花屏播多少秒，之后停在蓝屏 */
  computerCrashSeconds: 0.8,
  /** 抖动和闪屏每隔多少秒换一下方向或颜色 */
  computerFlickerSeconds: 0.067,
  /** 屏幕上的光标亮、灭各多少秒 */
  cursorBlinkSeconds: 0.5,
  /** 小人头顶的符号冒出来以后，每隔多少秒上下换一次位置 */
  mascotSymbolBobSeconds: 0.5,
} as const;

/**
 * 频道小人（Mascot 组件可选的 Q 版角色）：从 AI 生成的 Q 版设定图裁出，
 * 不是对齐网格的像素画，只能按原尺寸、整数倍或 1/2（`MASCOT_SCALE`）、最近邻插值显示。
 * `width`/`height` 是图片原始尺寸。
 */
export const MASCOTS = {
  dragon: { file: "character/q-1-dragon.png", width: 410, height: 589 },
  reader: { file: "character/q-2-reader.png", width: 374, height: 560 },
  whale: { file: "character/q-3-whale.png", width: 440, height: 592 },
  gothic: { file: "character/q-4-gothic.png", width: 440, height: 589 },
} as const;

export type MascotName = keyof typeof MASCOTS;

/**
 * 小人显示成原图的几倍：1/2，最近邻缩小（#42 人工关口，用户选了 A）。原尺寸一个小人要占
 * 3 列 × 5 行，表现不了「一群」；1/2 后 1 像素的描边有些地方会断续，用户看过样帧认可。
 */
export const MASCOT_SCALE = 1 / 2;

/** 小人在画面上的显示尺寸（屏幕像素）：原图 × `MASCOT_SCALE`，四舍五入到整数像素 */
export const mascotSize = (character: MascotName) => ({
  width: Math.round(MASCOTS[character].width * MASCOT_SCALE),
  height: Math.round(MASCOTS[character].height * MASCOT_SCALE),
});

/**
 * 小人头顶的符号（Mascot 的 `question`、`exclaim` 状态）：点阵，`#` 是一个点，`.` 是空。
 * 每个点画成 `SIZE.mascotSymbolDot` 见方，外面描一圈 `SIZE.mascotSymbolOutline` 宽的 `ink`。
 * 画成点阵而不是用字体里的「？」「！」：组件不渲染参数以外的固定文字（修订 D4）。
 */
export const MASCOT_SYMBOLS = {
  question: [
    ".###.",
    "#...#",
    "....#",
    "...#.",
    "..#..",
    ".....",
    "..#..",
  ],
  exclaim: [
    "..#..",
    "..#..",
    "..#..",
    "..#..",
    "..#..",
    ".....",
    "..#..",
  ],
} as const;
