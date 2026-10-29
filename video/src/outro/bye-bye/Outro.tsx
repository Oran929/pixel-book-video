// 片尾（#51）：用户定稿的作品，原样搬进来，只为类型检查（noUncheckedIndexedAccess）加了非空断言 `!`。
// 配色、尺寸、时间点都是用户定的，不按组件规则改；说明见 README「片头和片尾」。
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import T from "./timing.json";
import { BLOB, BOOK, COIN, HEART, PAD, Sprite, SpriteDef, STAR } from "./sprites";

const W = 1920;
const H = 1080;
const G = 4;
const snap = (v: number) => Math.round(v / G) * G;
const FONT = '"Fusion Pixel 12px"';
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const C = {
  ink: "#2b2b3a",
  night: "#14142a",
  ground: "#1f1b3d",
  paper: "#f4ecd8",
  cream: "#fffaf0",
  orange: "#e07a3f",
  rust: "#a8502a",
  yellow: "#f2c14e",
  green: "#5fa55a",
  forest: "#2f6b4f",
  blue: "#3f7cc8",
  navy: "#2a4a8a",
  purple: "#7a5ba8",
  red: "#c8423b",
  pink: "#e89aa6",
};

const text = (size: number, color: string, outline?: string, ow = size / 12) => ({
  fontFamily: FONT,
  fontSize: size,
  lineHeight: 1,
  color,
  whiteSpace: "pre" as const,
  WebkitFontSmoothing: "none" as const,
  textShadow: outline
    ? [-ow, 0, ow]
        .flatMap((x) => [-ow, 0, ow].map((y) => [x, y]))
        .filter(([x, y]) => x || y)
        .map(([x, y]) => `${x}px ${y}px 0 ${outline}`)
        .join(",")
    : undefined,
});

/* ---------------- 时间函数 ---------------- */
const FLOOR = 840;
// 地面滚动距离：开跑后向左滚，营造奔跑感
const scrollAt = (f: number) => Math.max(0, f - T.run) * 14 + Math.max(0, f - T.dash) ** 2 * 0.4;
// 元素墙的前沿：先慢慢追，小人冲刺时一口气铺满
const frontAt = (f: number) => {
  if (f < T.wallIn) return 0;
  if (f < T.dash) return interpolate(f, [T.wallIn, T.dash], [0, 640], { ...clamp, easing: Easing.out(Easing.quad) });
  const p = Math.min(1, (f - T.dash) / (T.full - T.dash));
  return 640 + (W - 640) * p * p;
};

/* ---------------- CRT ---------------- */
const CRT: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill
      style={{
        background:
          "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 4px, rgba(0,0,0,0.22) 4px, rgba(0,0,0,0.22) 8px)",
      }}
    />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
  </AbsoluteFill>
);

/* ---------------- 横向卷动的背景 ---------------- */
const Backdrop: React.FC<{ frame: number }> = ({ frame }) => {
  const sc = scrollAt(frame);
  const stars = Array.from({ length: 80 }, (_, i) => {
    const depth = 0.08 + random(`d${i}`) * 0.25;
    const x = snap((((random(`sx${i}`) * W - sc * depth) % W) + W) % W);
    const y = snap(random(`sy${i}`) * (FLOOR - 60));
    const s = random(`ss${i}`) > 0.85 ? 8 : 4;
    const tw = Math.sin(frame / 5 + i) > 0.2 ? 1 : 0.35;
    return <div key={i} style={{ position: "absolute", left: x, top: y, width: s, height: s, background: C.cream, opacity: tw }} />;
  });
  // 远处的像素山丘（慢速视差）
  const hills = Array.from({ length: 12 }, (_, i) => {
    const w = 240;
    const x = snap(((((i * w - sc * 0.35) % (W + w)) + W + w) % (W + w)) - w);
    const h = snap(80 + random(`h${i}`) * 120);
    return <div key={i} style={{ position: "absolute", left: x, top: FLOOR - h, width: w, height: h, background: "#231f48" }} />;
  });
  // 地面砖块：快速向左滚
  const tiles = Array.from({ length: 18 }, (_, i) => {
    const w = 120;
    const x = snap(((((i * w - sc) % (W + w)) + W + w) % (W + w)) - w);
    return (
      <React.Fragment key={i}>
        <div style={{ position: "absolute", left: x, top: FLOOR + 8, width: 8, height: 48, background: "#2c2758" }} />
        <div style={{ position: "absolute", left: x + 60, top: FLOOR + 64, width: 8, height: 56, background: "#2c2758" }} />
      </React.Fragment>
    );
  });
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {stars}
      {hills}
      <div style={{ position: "absolute", left: 0, top: FLOOR, width: W, height: H - FLOOR, background: C.ground }} />
      <div style={{ position: "absolute", left: 0, top: FLOOR - 4, width: W, height: 8, background: C.orange }} />
      <div style={{ position: "absolute", left: 0, top: FLOOR + 56, width: W, height: 8, background: "#2c2758" }} />
      {tiles}
    </AbsoluteFill>
  );
};

/* ---------------- 小人 ---------------- */
const SCALE = 0.55;
const CAST = [
  { file: "character/q-3-whale.png", w: 440, h: 592 },
  { file: "character/q-4-gothic.png", w: 440, h: 589 },
  { file: "character/q-1-dragon.png", w: 410, h: 589 },
  { file: "character/q-2-reader.png", w: 374, h: 560 },
];
const BASE_X = [615, 845, 1075, 1305];

const charX = (i: number, f: number) => {
  const drift = Math.max(0, f - T.run) * 1.6;
  const dash = Math.max(0, f - T.dash - i * 2);
  // 前面的先冲出去：越靠右加速越早
  return BASE_X[i]! + drift + 0.5 * (2.0 + (3 - i) * 0.25) * dash * dash;
};

const Runner: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const c = CAST[i]!;
  const start = T.drops[i]!;
  const f = frame - start;
  if (f < 0) return null;
  const w = c.w * SCALE;
  const h = c.h * SCALE;
  const cx = charX(i, frame);
  if (cx - w / 2 > W + 40) return null;

  const drop = interpolate(f, [0, 7], [-800, 0], { ...clamp, easing: Easing.in(Easing.quad) });
  const squash = f >= 7 && f < 12 ? [0.84, 0.92, 1.06, 1.02, 1][f - 7]! : 1;
  const whiteFlash = f >= 7 && f < 10;

  // 发现元素墙：原地一跳
  const n = frame - T.notice - i * 2;
  const jump = n >= 0 && n < 8 ? -Math.sin((n / 8) * Math.PI) * 48 : 0;

  // 奔跑：上下颠 + 向前倾
  const r = frame - T.run;
  const running = r >= 0;
  const bob = running ? -Math.abs(Math.sin(((frame + i * 3) * Math.PI) / 6)) * 28 : 0;
  const tilt = running ? 6 + Math.sin(((frame + i * 3) * Math.PI) / 6) * 3 : 0;

  const y = snap(drop + jump + bob);
  return (
    <>
      {/* 影子 */}
      {f >= 7 && (
        <div
          style={{
            position: "absolute",
            left: snap(cx - w * 0.3),
            top: FLOOR - 8,
            width: snap(w * 0.6),
            height: 12,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: snap(cx - w / 2),
          top: FLOOR - h + y,
          width: w,
          height: h,
          transform: `rotate(${tilt}deg) scale(${2 - squash}, ${squash})`,
          transformOrigin: "50% 100%",
          filter: whiteFlash ? "brightness(4) saturate(0)" : undefined,
        }}
      >
        <Img src={staticFile(c.file)} style={{ width: w, height: h, imageRendering: "pixelated" }} />
      </div>
      {/* 落地尘土 */}
      {f >= 7 && f < 16 &&
        [-1, 1].flatMap((dir) =>
          [0, 1, 2].map((k) => {
            const t = (f - 7) / 9;
            return (
              <div
                key={`${dir}${k}`}
                style={{
                  position: "absolute",
                  left: snap(cx + dir * (40 + t * (90 + k * 40))),
                  top: snap(FLOOR - 8 - t * (24 + k * 20) + t * t * 30),
                  width: 16 - k * 4,
                  height: 16 - k * 4,
                  background: C.paper,
                  opacity: 1 - t,
                }}
              />
            );
          }),
        )}
      {/* 跑步扬起的尘土 */}
      {running &&
        [0, 1, 2].map((k) => {
          const t = (((frame + k * 4 + i * 2) % 12) / 12);
          return (
            <div
              key={`r${k}`}
              style={{
                position: "absolute",
                left: snap(cx - w * 0.35 - t * 90),
                top: snap(FLOOR - 12 - t * 30),
                width: 12,
                height: 12,
                background: C.paper,
                opacity: (1 - t) * 0.7,
              }}
            />
          );
        })}
      {/* 头顶感叹号 */}
      {n >= 0 && frame < T.run + 14 && (
        <div
          style={{
            position: "absolute",
            left: snap(cx - 36),
            top: FLOOR - h - 96 + y,
            width: 72,
            height: 80,
            background: C.cream,
            border: `8px solid ${C.ink}`,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${n < 3 ? [0.4, 1.3, 1.1][n] : 1})`,
          }}
        >
          <span style={text(48, C.red)}>!</span>
        </div>
      )}
    </>
  );
};

/* ---------------- 元素墙 ---------------- */
const CELL = 120;
const ROWS = 9;
const TILE_COLORS = [
  [C.navy, "#4f74b8", "#1c3466"],
  [C.purple, "#9a7fc4", "#5a4080"],
  [C.rust, "#c96f45", "#7a3a1e"],
  [C.forest, "#4f8f6f", "#1f4a36"],
  [C.blue, "#6a9be0", "#2a5a9a"],
  ["#3a3a52", "#55557a", "#22222f"],
];
const SPRITES: { def: SpriteDef; px: number }[] = [
  { def: COIN, px: 7 },
  { def: HEART, px: 9 },
  { def: STAR, px: 8 },
  { def: BLOB, px: 7 },
  { def: BOOK, px: 5 },
  { def: PAD, px: 4 },
];

const Tile: React.FC<{ col: number; row: number }> = ({ col, row }) => {
  const k = Math.floor(random(`tc${col}-${row}`) * TILE_COLORS.length);
  const [bg, hi, lo] = TILE_COLORS[k]!;
  const s = SPRITES[Math.floor(random(`ts${col}-${row}`) * SPRITES.length)]!;
  const empty = random(`te${col}-${row}`) < 0.12;
  return (
    <div
      style={{
        width: CELL,
        height: CELL,
        boxSizing: "border-box",
        background: bg,
        borderTop: `8px solid ${hi}`,
        borderLeft: `8px solid ${hi}`,
        borderBottom: `8px solid ${lo}`,
        borderRight: `8px solid ${lo}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {!empty && <Sprite def={s.def} px={s.px} />}
    </div>
  );
};

const Wall: React.FC<{ frame: number }> = ({ frame }) => {
  const front = frontAt(frame);
  if (front <= 0) return null;
  const cols: React.ReactNode[] = [];
  for (let j = 0; ; j++) {
    const x = front - CELL * (j + 1);
    if (x + CELL <= 0) break;
    const lead = j === 0 && frame < T.full;
    for (let r = 0; r < ROWS; r++) {
      // 已经铺满后进入翻转转场
      if (frame >= T.flip) continue;
      const wob = lead ? Math.sin(frame / 2 + r) * 8 : 0;
      const dy = lead ? snap(Math.sin(frame / 3 + r * 1.7) * 12) : 0;
      cols.push(
        <div
          key={`${j}-${r}`}
          style={{ position: "absolute", left: snap(x), top: r * CELL + dy, transform: `rotate(${wob}deg)` }}
        >
          <Tile col={j} row={r} />
        </div>,
      );
    }
  }
  // 前沿外飞溅的像素
  const sparks =
    frame < T.full
      ? Array.from({ length: 18 }, (_, i) => {
          const life = ((frame + i * 5) % 16) / 16;
          const y0 = random(`sy${i}`) * H;
          return (
            <div
              key={`s${i}`}
              style={{
                position: "absolute",
                left: snap(front + life * (60 + random(`sv${i}`) * 140)),
                top: snap(y0 + Math.sin(life * 3 + i) * 20),
                width: 12,
                height: 12,
                background: [C.yellow, C.cream, C.pink, C.green][i % 4],
                opacity: 1 - life,
              }}
            />
          );
        })
      : null;
  return (
    <AbsoluteFill>
      {cols}
      {sparks}
    </AbsoluteFill>
  );
};

/* ---------------- BYE-BYE 转场 ---------------- */
const GLYPHS: Record<string, string[]> = {
  B: ["XX.", "X.X", "XX.", "X.X", "XX."],
  Y: ["X.X", "X.X", ".X.", ".X.", ".X."],
  E: ["XXX", "X..", "XX.", "X..", "XXX"],
  "-": ["..", "..", "XX", "..", ".."],
};
const WORD = "BYE-BYE";
const SUB = 60; // 小格子
const SUB_COLS = 32;
const SUB_ROWS = 18;
const TOP_ROW = 6;
// 计算每个小格属于哪个字母（-1 = 背景）
const BITMAP: number[][] = (() => {
  const grid = Array.from({ length: SUB_ROWS }, () => Array(SUB_COLS).fill(-1));
  const width = [...WORD].reduce((a, ch) => a + GLYPHS[ch]![0]!.length, 0) + WORD.length - 1;
  let x = Math.floor((SUB_COLS - width) / 2);
  [...WORD].forEach((ch, li) => {
    const g = GLYPHS[ch]!;
    g.forEach((row, ry) => [...row].forEach((v, rx) => v === "X" && (grid[TOP_ROW + ry]![x + rx] = li)));
    x += g[0]!.length + 1;
  });
  return grid;
})();

const flipTime = (c: number, r: number) => T.flip + (c + r) * 0.62;

const ByeCell: React.FC<{ sc: number; sr: number; frame: number }> = ({ sc, sr, frame }) => {
  const li = BITMAP[sr]![sc]!;
  const x = sc * SUB;
  const y = sr * SUB;
  if (li < 0) {
    // 背景：深色，偶尔一颗星
    const star = random(`bs${sc}-${sr}`) < 0.06 && Math.sin(frame / 4 + sc) > 0;
    return (
      <div style={{ position: "absolute", left: x, top: y, width: SUB, height: SUB, background: C.night }}>
        {star && <div style={{ position: "absolute", left: 28, top: 28, width: 8, height: 8, background: C.cream }} />}
      </div>
    );
  }
  const since = frame - T.bye;
  const bounce = since >= 0 ? snap(-Math.max(0, Math.sin(since / 3.2 - li * 0.7)) * 20 * Math.max(0, 1 - since / 36)) : 0;
  const isDash = WORD[li] === "-";
  const face = isDash ? C.yellow : C.orange;
  return (
    <>
      <div style={{ position: "absolute", left: x + 12, top: y + 12 + bounce, width: SUB, height: SUB, background: "#000" }} />
      <div
        style={{
          position: "absolute",
          left: x,
          top: y + bounce,
          width: SUB,
          height: SUB,
          boxSizing: "border-box",
          background: face,
          borderTop: `8px solid ${isDash ? "#fff1b8" : "#f6a877"}`,
          borderLeft: `8px solid ${isDash ? "#fff1b8" : "#f6a877"}`,
          borderBottom: `8px solid ${isDash ? "#b8902e" : C.rust}`,
          borderRight: `8px solid ${isDash ? "#b8902e" : C.rust}`,
        }}
      />
    </>
  );
};

const ByeBye: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < T.flip) return null;
  const cells: React.ReactNode[] = [];
  // 墙的 16×9 大格逐个翻面（按对角线顺序），翻过去后露出 2×2 个小格
  for (let c = 0; c < 16; c++) {
    for (let r = 0; r < ROWS; r++) {
      const d = frame - flipTime(c, r);
      const x = c * CELL;
      const y = r * CELL;
      if (d < 3) {
        const sy = d < 0 ? 1 : 1 - d / 3;
        cells.push(
          <div key={`o${c}-${r}`} style={{ position: "absolute", left: x, top: y, transform: `scaleY(${sy})` }}>
            <Tile col={15 - c} row={r} />
          </div>,
        );
      } else {
        const sy = Math.min(1, (d - 3) / 3);
        cells.push(
          <div
            key={`n${c}-${r}`}
            style={{ position: "absolute", left: x, top: y, width: CELL, height: CELL, transform: `scaleY(${sy})`, overflow: "visible" }}
          >
            <div style={{ position: "absolute", left: -x, top: -y }}>
              {[0, 1].flatMap((dx) => [0, 1].map((dy) => <ByeCell key={`${dx}${dy}`} sc={c * 2 + dx} sr={r * 2 + dy} frame={frame} />))}
            </div>
          </div>,
        );
      }
    }
  }
  return <AbsoluteFill style={{ background: C.night }}>{cells}</AbsoluteFill>;
};

/* ---------------- 字幕（和正片字幕框同一风格） ---------------- */
const Subtitle: React.FC<{ frame: number }> = ({ frame }) => {
  const line = T.lines.find((l) => frame >= l.start && frame < l.end + 6);
  if (!line) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          background: C.ink,
          border: `8px solid ${C.paper}`,
          boxShadow: `0 0 0 8px ${C.ink}, 16px 16px 0 8px rgba(0,0,0,0.5)`,
          padding: "24px 48px",
          minWidth: 960,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <span style={{ ...text(48, C.paper), lineHeight: "64px" }}>{line.text}</span>
      </div>
    </div>
  );
};

/* ---------------- 总装 ---------------- */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame();

  // 铺满瞬间：一记白闪 + 小震
  const fullFlash = interpolate(frame, [T.full, T.full + 2, T.flip], [0, 0.45, 0], clamp);
  const shaking = frame >= T.full && frame < T.flip + 2;
  const sx = shaking ? snap((random(`x${frame}`) - 0.5) * 40) : 0;
  const sy = shaking ? snap((random(`y${frame}`) - 0.5) * 24) : 0;

  // CRT 关机
  const off = interpolate(frame, [T.off, T.total - 4], [1, 0], clamp);
  const offScaleY = Math.max(0.004, off);
  const offScaleX = frame > T.total - 6 ? interpolate(frame, [T.total - 6, T.total - 1], [1, 0], clamp) : 1;

  // 冲刺时的速度线
  const speed = frame >= T.dash && frame < T.full;

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `translate(${sx}px, ${sy}px) scale(${offScaleX}, ${offScaleY})`,
          filter: frame >= T.off ? `brightness(${1 + (1 - off) * 2})` : undefined,
        }}
      >
        {frame < T.flip + 20 && <Backdrop frame={frame} />}
        {speed &&
          Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: snap(((random(`ll${i}`) * W - (frame - T.dash) * 90) % W + W) % W),
                top: snap(random(`lt${i}`) * FLOOR),
                width: 200 + snap(random(`lw${i}`) * 260),
                height: 8,
                background: "rgba(255,250,240,0.3)",
              }}
            />
          ))}
        {frame < T.flip && [0, 1, 2, 3].map((i) => <Runner key={i} i={i} frame={frame} />)}
        <Wall frame={frame} />
        <ByeBye frame={frame} />
        <Subtitle frame={frame} />
        <AbsoluteFill style={{ background: C.cream, opacity: fullFlash, pointerEvents: "none" }} />
        <CRT />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
