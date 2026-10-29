import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import { Mascot } from "../components/Mascot";
import { PixelBlock } from "../components/PixelBlock";
import type { MascotProps } from "../components/declarations";
import { Subtitle } from "../components/resident/Subtitle";
import {
  border,
  COLOR,
  FONT,
  FONT_SIZE,
  GRID,
  hardShadow,
  outlinedText,
  MASCOTS,
  PALETTE,
  pixelText,
  SIZE,
} from "../style/style";

// 风格样张（票 09）：集中展示调色板、像素字体、描边和阴影、小人组件。
// 只在 Studio 里看（合成 ID `StyleSheet`），渲染命令只渲染 `Episode`，不进入成片。

/** 样张画布：宽同成片，加高到放得下两排原尺寸的小人 */
export const STYLE_SHEET = { width: 1920, height: 4000 } as const;

/** 两个画框里的小人：三个站位，四个角色都出现一次 */
const STAGES: z.infer<typeof MascotProps>[][] = [
  [
    { character: "dragon", position: "left" },
    { character: "reader", position: "center" },
    { character: "whale", position: "right" },
  ],
  [{ character: "gothic", position: "center" }],
];

/** 画框高度：放得下最高的小人和上下两条细描边 */
const MASCOT_STAGE_HEIGHT =
  Math.max(...Object.values(MASCOTS).map((m) => m.height)) + SIZE.stroke * 2;

const SAMPLES = [
  "读一本8bit像素书",
  "今天我们一起读一本书。第一条原则叫 DRY。",
  "ABCDEFGHIJKLM abcdefghijklm 0123456789",
  "，。、；：？！“”‘’（）《》【】—…·",
  ",.;:?!\"'()[]<>-+*/=%&@#",
];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div
    style={{ display: "flex", flexDirection: "column", gap: SIZE.stroke * 2 }}
  >
    <div style={{ ...pixelText("small"), color: PALETTE.slate }}>{title}</div>
    {children}
  </div>
);

const Swatch: React.FC<{ name: string; hex: string }> = ({ name, hex }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: GRID * 2 }}>
    <div
      style={{
        width: GRID * 48,
        height: GRID * 24,
        backgroundColor: hex,
        border: border(SIZE.stroke, COLOR.ink),
      }}
    />
    <div style={{ ...pixelText("small"), color: COLOR.ink }}>
      {name} {hex}
    </div>
  </div>
);

const OUTLINED: { text: string; color: string; outline: string }[] = [
  { text: "橙字深描边", color: PALETTE.orange, outline: PALETTE.ink },
  { text: "黄字深描边", color: PALETTE.yellow, outline: PALETTE.ink },
  { text: "蓝字白描边", color: PALETTE.blue, outline: PALETTE.cream },
  { text: "红字白描边", color: PALETTE.red, outline: PALETTE.cream },
];

export const StyleSheet: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: COLOR.background,
      padding: SIZE.margin,
      display: "flex",
      flexDirection: "column",
      gap: SIZE.margin,
      color: COLOR.ink,
    }}
  >
    <div style={pixelText("large")}>风格样张</div>

    <Section title={`调色板（${Object.keys(PALETTE).length} 色）`}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: SIZE.margin / 2 }}>
        {Object.entries(PALETTE).map(([name, hex]) => (
          <Swatch key={name} name={name} hex={hex} />
        ))}
      </div>
    </Section>

    <Section
      title={`像素字体 ${FONT.family}：${Object.entries(FONT_SIZE)
        .map(
          ([name, size]) => `${name} ${size}px（×${size / FONT.designSize}）`,
        )
        .join("、")}`}
    >
      {(["large", "subtitle", "small"] as const).map((size) =>
        SAMPLES.slice(0, size === "large" ? 1 : SAMPLES.length).map((text) => (
          <div key={`${size}-${text}`} style={pixelText(size)}>
            {text}
          </div>
        )),
      )}
    </Section>

    <Section title="描边字：一个字体像素宽的描边，字距加宽两个字体像素">
      <div style={{ display: "flex", gap: SIZE.margin }}>
        {OUTLINED.map(({ text, color, outline }) => (
          <div
            key={text}
            style={{
              ...outlinedText("subtitle", color, outline),
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </div>
        ))}
        <div
          style={{
            ...outlinedText("large", COLOR.episodeTitle, COLOR.ink),
            whiteSpace: "nowrap",
          }}
        >
          DRY
        </div>
      </div>
    </Section>

    <Section title="描边与阴影：细描边、粗描边、右下硬阴影；字幕框、方块组件">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: SIZE.margin,
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: SIZE.block / 2,
            height: SIZE.block / 2,
            backgroundColor: PALETTE.cream,
            border: border(SIZE.stroke, COLOR.ink),
          }}
        />
        <div
          style={{
            width: SIZE.block / 2,
            height: SIZE.block / 2,
            backgroundColor: PALETTE.green,
            border: border(SIZE.strokeThick, COLOR.ink),
          }}
        />
        <div
          style={{
            width: SIZE.block / 2,
            height: SIZE.block / 2,
            backgroundColor: PALETTE.blue,
            border: border(SIZE.strokeThick, COLOR.ink),
            boxShadow: hardShadow(COLOR.ink),
          }}
        />
        {/* 方块组件 PixelBlock，原样放进一个小画框 */}
        <div
          style={{
            position: "relative",
            width: SIZE.block * 2,
            height: SIZE.block + SIZE.blockLift + SIZE.margin,
          }}
        >
          <PixelBlock label="DRY" />
        </div>
        {/* 字幕框本身，按成片里的样子放在画框里 */}
        <div
          style={{
            position: "relative",
            width: SIZE.subtitleMinWidth + SIZE.margin * 4,
            height: SIZE.margin * 4,
            border: border(SIZE.stroke, PALETTE.sand),
          }}
        >
          <Subtitle text="字幕框：今天我们一起读一本书。" />
        </div>
      </div>
    </Section>

    <Section title="小人组件 Mascot（占位，原尺寸，最近邻插值）：画框和成片一样宽，看三个站位和四个 Q 版角色">
      {STAGES.map((stage) => (
        <div
          key={stage.map((m) => m.character).join()}
          style={{ display: "flex", flexDirection: "column", gap: GRID * 2 }}
        >
          <div style={{ ...pixelText("small"), color: COLOR.ink }}>
            {stage.map((m) => `${m.character} ${m.position}`).join("、")}
          </div>
          <div
            style={{
              position: "relative",
              height: MASCOT_STAGE_HEIGHT,
              border: border(SIZE.stroke, PALETTE.sand),
            }}
          >
            {stage.map((props) => (
              <Mascot key={props.character} {...props} />
            ))}
          </div>
        </div>
      ))}
    </Section>
  </AbsoluteFill>
);
