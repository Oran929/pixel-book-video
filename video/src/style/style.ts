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
  /** 方块组件的边长 */
  block: cells(80),
  /** 方块组件比画面中心高出的距离 */
  blockLift: cells(60),
  /** 落下动画的起点在终点上方多远 */
  slideDistance: cells(40),
  /** 小人组件站在左边或右边时离画面边缘的距离（比边距小，免得和最长的字幕框重叠） */
  mascotInset: cells(8),
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
} as const;

/**
 * 频道小人（Mascot 组件可选的 Q 版角色）：从 AI 生成的 Q 版设定图裁出，
 * 不是对齐网格的像素画，只能按原尺寸（或整数倍）、最近邻插值显示。
 * `width`/`height` 是图片原始尺寸。
 */
export const MASCOTS = {
  dragon: { file: "character/q-1-dragon.png", width: 410, height: 589 },
  reader: { file: "character/q-2-reader.png", width: 374, height: 560 },
  whale: { file: "character/q-3-whale.png", width: 440, height: 592 },
  gothic: { file: "character/q-4-gothic.png", width: 440, height: 589 },
} as const;
