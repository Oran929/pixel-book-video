// 片头（#50）：用户定稿的作品，原样搬进来，只为类型检查（noUncheckedIndexedAccess）加了非空断言 `!`。
// 配色、尺寸、时间点都是用户定的，不按组件规则改；说明见 README「片头」。
import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from "remotion";
import T from "./timing.json";
import { BLOB, BOOK, COIN, HEART, PAD, Sprite, STAR } from "./sprites";

const W = 1920;
const H = 1080;
const G = 4; // 像素网格
const snap = (v: number) => Math.round(v / G) * G;
const FONT = '"Fusion Pixel 12px"';

const C = {
  ink: "#2b2b3a",
  night: "#14142a",
  navy: "#2a4a8a",
  paper: "#f4ecd8",
  cream: "#fffaf0",
  orange: "#e07a3f",
  rust: "#a8502a",
  yellow: "#f2c14e",
  green: "#5fa55a",
  blue: "#3f7cc8",
  purple: "#7a5ba8",
  red: "#c8423b",
  phosphor: "#7dff9a",
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

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

/* ---------------- 公共：CRT 扫描线 + 暗角 ---------------- */
const CRT: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill
      style={{
        background:
          "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 4px, rgba(0,0,0,0.22) 4px, rgba(0,0,0,0.22) 8px)",
      }}
    />
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
      }}
    />
  </AbsoluteFill>
);

/* ---------------- 公共：像素星空 + 滚动地面 ---------------- */
const Starfield: React.FC<{ frame: number; dim?: number }> = ({ frame, dim = 1 }) => {
  const stars = Array.from({ length: 90 }, (_, i) => {
    const x = snap(random(`sx${i}`) * W);
    const y = snap(random(`sy${i}`) * 700);
    const s = random(`ss${i}`) > 0.85 ? 8 : 4;
    const tw = Math.sin(frame / 5 + i) > 0.2 ? 1 : 0.35;
    return <div key={i} style={{ position: "absolute", left: x, top: y, width: s, height: s, background: C.cream, opacity: tw * dim }} />;
  });
  // 透视感地面：横线向下越来越疏，向镜头滚动
  const lines = Array.from({ length: 10 }, (_, i) => {
    const t = ((i + (frame % 15) / 15) / 10) ** 2;
    const y = snap(760 + t * 320);
    return <div key={i} style={{ position: "absolute", left: 0, top: y, width: W, height: G, background: C.purple, opacity: 0.6 * dim }} />;
  });
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {stars}
      <div style={{ position: "absolute", left: 0, top: 760, width: W, height: H - 760, background: "#1f1b3d", opacity: dim }} />
      <div style={{ position: "absolute", left: 0, top: 756, width: W, height: 8, background: C.orange, opacity: dim }} />
      {lines}
    </AbsoluteFill>
  );
};

/* ---------------- 1. 命令行光标 + 打字 ---------------- */
const Terminal: React.FC<{ frame: number }> = ({ frame }) => {
  const typed = T.keys.filter((k) => frame >= k).length;
  const line = "> " + T.text.slice(0, typed);
  const blinkOn = frame < T.keys[0]! ? Math.floor(frame / 12) % 2 === 0 : typed < T.text.length ? true : Math.floor(frame / 6) % 2 === 0;
  const afterEnter = frame >= T.enter;
  const loading = frame >= T.enter + 3;
  return (
    <AbsoluteFill style={{ background: "#0a0d0a", alignItems: "center", justifyContent: "center" }}>
      {/* 荧光屏微光 */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(125,255,154,0.10) 0%, rgba(0,0,0,0) 60%)" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 32 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ ...text(84, C.phosphor), textShadow: "0 0 18px rgba(125,255,154,0.6)" }}>{line}</span>
          {!afterEnter && (
            <span style={{ width: 48, height: 84, background: C.phosphor, opacity: blinkOn ? 1 : 0, marginLeft: 8, boxShadow: "0 0 18px rgba(125,255,154,0.7)" }} />
          )}
        </div>
        {loading && (
          <span style={{ ...text(84, C.phosphor), textShadow: "0 0 18px rgba(125,255,154,0.6)" }}>
            {"LOADING" + ".".repeat(Math.min(3, Math.floor((frame - T.enter - 3) / 2)))}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- 2/3. 四个角色 ---------------- */
const CAST = [
  { name: "DeepSeek", file: "character/q-3-whale.png", w: 440, h: 592, color: C.blue },
  { name: "Grok", file: "character/q-4-gothic.png", w: 440, h: 589, color: C.purple },
  { name: "ChatGPT", file: "character/q-1-dragon.png", w: 410, h: 589, color: C.green },
  { name: "Claude", file: "character/q-2-reader.png", w: 374, h: 560, color: C.orange },
];
const SCALE = 0.85;
const FEET = 820;
const XS = [300, 740, 1180, 1620];
// 书在 q-2-reader.png 里的中心（原图像素）
const BOOK_PT = { x: 272, y: 300 };

const CastMember: React.FC<{ i: number; frame: number; focusP: number }> = ({ i, frame, focusP }) => {
  const c = CAST[i]!;
  const start = T.chars[i]!;
  const f = frame - start;
  if (f < 0) return null;
  const w = c.w * SCALE;
  const h = c.h * SCALE;
  const left = XS[i]! - w / 2;
  const top = FEET - h;
  // 从天而降 7 帧，落地压扁回弹
  const drop = interpolate(f, [0, 7], [-900, 0], { ...clamp, easing: Easing.in(Easing.quad) });
  const squash = f >= 7 && f < 12 ? [0.86, 0.92, 1.05, 1.02, 1][f - 7]! : 1;
  const whiteFlash = f >= 7 && f < 10;
  const isClaude = i === 3;

  let transform = `translateY(${snap(drop)}px) scale(${2 - squash}, ${squash})`;
  let opacity = 1;
  let extraY = 0;
  if (focusP > 0) {
    if (isClaude) {
      const bx = left + BOOK_PT.x * SCALE;
      const by = top + BOOK_PT.y * SCALE;
      const p = Easing.inOut(Easing.cubic)(focusP);
      const dx = (W / 2 - bx) * Math.min(1, p * 1.6);
      const dy = (H / 2 - by) * Math.min(1, p * 1.6);
      const z = 1 + Math.pow(focusP, 1.6) * 4.5;
      transform = `translate(${snap(dx)}px, ${snap(dy)}px) scale(${z})`;
    } else {
      opacity = interpolate(focusP, [0, 0.35], [1, 0], clamp);
      extraY = snap(interpolate(focusP, [0, 0.35], [0, 120], clamp));
    }
  }

  return (
    <>
      <div
        style={{
          position: "absolute",
          left,
          top: top + extraY,
          width: w,
          height: h,
          opacity,
          transform,
          transformOrigin: focusP > 0 && isClaude ? `${BOOK_PT.x * SCALE}px ${BOOK_PT.y * SCALE}px` : "50% 100%",
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
                  left: snap(XS[i]! + dir * (60 + t * (120 + k * 50))),
                  top: snap(FEET - 8 - t * (30 + k * 24) + t * t * 40),
                  width: 12 - k * 4 + 4,
                  height: 12 - k * 4 + 4,
                  background: C.paper,
                  opacity: 1 - t,
                }}
              />
            );
          }),
        )}
      {/* P1~P4 */}
      {f >= 8 && focusP === 0 && (
        <div style={{ position: "absolute", left: XS[i]! - 60, width: 120, top: top - 64, textAlign: "center", ...text(36, c.color, C.ink, 4), opacity: Math.floor(f / 4) % 2 || f > 24 ? 1 : 0 }}>
          {`P${i + 1}`}
        </div>
      )}
    </>
  );
};

/* 书本发光：围绕书中心旋转的像素光束 + 外扩方环 */
const BookGlow: React.FC<{ frame: number; focusP: number }> = ({ frame, focusP }) => {
  if (focusP <= 0) return null;
  const left = XS[3]! - (CAST[3]!.w * SCALE) / 2;
  const top = FEET - CAST[3]!.h * SCALE;
  const bx = left + BOOK_PT.x * SCALE;
  const by = top + BOOK_PT.y * SCALE;
  const p = Easing.inOut(Easing.cubic)(focusP);
  const cx = bx + (W / 2 - bx) * Math.min(1, p * 1.6);
  const cy = by + (H / 2 - by) * Math.min(1, p * 1.6);
  const k = interpolate(focusP, [0.15, 1], [0, 1], clamp);
  const rot = frame * 2.4;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = ((i * 30 + rot) * Math.PI) / 180;
    const a2 = a + 0.09;
    const R = 2400;
    return `M0 0 L${Math.cos(a) * R} ${Math.sin(a) * R} L${Math.cos(a2) * R} ${Math.sin(a2) * R} Z`;
  });
  const rings = Array.from({ length: 4 }, (_, i) => {
    const t = ((frame * 1.0 + i * 8) % 32) / 32;
    const s = snap(40 + t * 900 * (0.4 + k));
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: snap(cx - s / 2),
          top: snap(cy - s / 2),
          width: s,
          height: s,
          border: `${G * 3}px solid ${C.yellow}`,
          opacity: (1 - t) * k,
        }}
      />
    );
  });
  return (
    <>
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: 0.55 * k, mixBlendMode: "screen" }} shapeRendering="crispEdges">
        <g transform={`translate(${cx} ${cy})`}>
          {rays.map((d, i) => (
            <path key={i} d={d} fill={i % 2 ? C.yellow : C.orange} />
          ))}
        </g>
      </svg>
      {rings}
      {/* 书面上的金光（像素化的同心方块） */}
      {[5, 4, 3, 2, 1].map((n) => {
        const s = snap(n * 70 * (0.6 + k * 2.4));
        return (
          <div
            key={n}
            style={{
              position: "absolute",
              left: snap(cx - s / 2),
              top: snap(cy - s / 2),
              width: s,
              height: s,
              background: n === 1 ? C.cream : C.yellow,
              opacity: k * (0.12 + (5 - n) * 0.06),
              mixBlendMode: "screen",
            }}
          />
        );
      })}
      {/* 飞散的光点 */}
      {Array.from({ length: 26 }, (_, i) => {
        const a = random(`ga${i}`) * Math.PI * 2;
        const sp = 8 + random(`gs${i}`) * 26;
        const life = ((frame + i * 7) % 24) / 24;
        const d = life * sp * 24;
        const s = random(`gz${i}`) > 0.6 ? 12 : 8;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: snap(cx + Math.cos(a) * d),
              top: snap(cy + Math.sin(a) * d),
              width: s,
              height: s,
              background: i % 3 ? C.yellow : C.cream,
              opacity: k * (1 - life),
            }}
          />
        );
      })}
    </>
  );
};

const Stage: React.FC<{ frame: number }> = ({ frame }) => {
  const focusP = interpolate(frame, [T.focus, T.flash], [0, 1], clamp);
  const sinceScene = frame - T.scene;
  // 进场：从白闪中亮起
  const enterFlash = interpolate(sinceScene, [0, 6], [1, 0], clamp);
  const flash = interpolate(frame, [T.flash - 6, T.flash], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Starfield frame={frame} dim={1 - focusP * 0.7} />
      {/* 背景压暗 + 金色晕 */}
      <AbsoluteFill style={{ background: "#000", opacity: focusP * 0.5 }} />
      <BookGlow frame={frame} focusP={focusP} />
      {[0, 1, 2, 3].map((i) => (
        <CastMember key={i} i={i} frame={frame} focusP={focusP} />
      ))}
      {focusP > 0 && <BookGlowFront frame={frame} focusP={focusP} />}
      {/* 顶部 HUD */}
      <div style={{ position: "absolute", left: 64, top: 48, ...text(36, C.cream, C.ink, 4), opacity: 1 - focusP * 3 }}>
        {"SELECT PLAYER"}
      </div>
      <div style={{ position: "absolute", right: 64, top: 48, ...text(36, C.yellow, C.ink, 4), opacity: 1 - focusP * 3 }}>
        {`CREDIT ${Math.min(4, T.chars.filter((c) => frame >= c + 7).length)}`}
      </div>
      <AbsoluteFill style={{ background: C.cream, opacity: Math.max(enterFlash, flash) }} />
    </AbsoluteFill>
  );
};

/* 放大后期，书本前方再盖一层光，让“发光”更明显 */
const BookGlowFront: React.FC<{ frame: number; focusP: number }> = ({ frame, focusP }) => {
  const k = interpolate(focusP, [0.3, 1], [0, 1], clamp);
  if (k <= 0) return null;
  const pulse = 0.85 + 0.15 * Math.sin(frame / 2);
  const s = snap(260 + k * 1000);
  return (
    <div
      style={{
        position: "absolute",
        left: snap(W / 2 - s / 2),
        top: snap(H / 2 - s / 2),
        width: s,
        height: s,
        background: `radial-gradient(circle, ${C.cream} 0%, ${C.yellow} 30%, rgba(242,193,78,0) 70%)`,
        opacity: k * 0.7 * pulse,
        mixBlendMode: "screen",
      }}
    />
  );
};

/* ---------------- 4. 街机元素快切 ---------------- */
const Cut: React.FC<{ bg: string; children: React.ReactNode; f: number }> = ({ bg, children, f }) => (
  <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
    {/* 速度线 */}
    {Array.from({ length: 14 }, (_, i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          left: snap(((random(`cl${i}`) * W + f * 260) % (W + 400)) - 400),
          top: snap(random(`ct${i}`) * H),
          width: 240 + snap(random(`cw${i}`) * 300),
          height: 8,
          background: "rgba(255,250,240,0.25)",
        }}
      />
    ))}
    <div style={{ transform: `scale(${f === 0 ? 1.25 : 1})` }}>{children}</div>
  </AbsoluteFill>
);

const Arcade: React.FC<{ frame: number }> = ({ frame }) => {
  const idx = Math.floor((frame - T.arcade) / T.cut);
  const f = (frame - T.arcade) % T.cut;
  const score = String(4200 + idx * 13370 + f * 777).padStart(6, "0");
  const cuts = [
    <Cut key="0" bg="#000" f={f}>
      <div style={{ display: "flex", alignItems: "center", gap: 64 }}>
        <Sprite def={COIN} px={24} />
        <span style={text(144, C.yellow, C.rust, 12)}>INSERT COIN</span>
      </div>
    </Cut>,
    <Cut key="1" bg={C.navy} f={f}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
        <span style={text(72, C.red, C.ink, 6)}>1UP</span>
        <span style={text(192, C.cream, C.ink, 12)}>{score}</span>
      </div>
    </Cut>,
    <Cut key="2" bg={C.red} f={f}>
      <div style={{ display: "flex", gap: 48 }}>
        {[0, 1, 2].map((i) => (
          <Sprite key={i} def={HEART} px={36} />
        ))}
      </div>
    </Cut>,
    <Cut key="3" bg={C.purple} f={f}>
      <div style={{ display: "flex", gap: 80, alignItems: "flex-end" }}>
        <Sprite def={BLOB} px={30} />
        <Sprite def={BLOB} px={20} style={{ transform: "translateY(-80px)" }} />
        <Sprite def={BLOB} px={30} />
      </div>
    </Cut>,
    <Cut key="4" bg={C.blue} f={f}>
      <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
        <Sprite def={STAR} px={28} />
        <span style={text(168, C.yellow, C.ink, 12)}>LEVEL UP!</span>
        <Sprite def={STAR} px={28} />
      </div>
    </Cut>,
    <Cut key="5" bg={C.orange} f={f}>
      <Sprite def={PAD} px={40} />
    </Cut>,
    <Cut key="6" bg={C.green} f={f}>
      <span style={text(216, C.cream, C.ink, 14)}>{`COMBO x${String(12 + idx * 11 + f * 6)}`}</span>
    </Cut>,
    <Cut key="7" bg="#000" f={f}>
      <span style={text(192, C.cream, C.red, 12)}>READY?</span>
    </Cut>,
  ];
  // 每一刀开头一帧反色闪
  return (
    <AbsoluteFill>
      {cuts[Math.min(idx, cuts.length - 1)]}
      {f === 0 && <AbsoluteFill style={{ background: C.cream, opacity: 0.6 }} />}
    </AbsoluteFill>
  );
};

/* ---------------- 5. 标题 PIXEL BOOK ---------------- */
const TITLE = "PIXEL BOOK";
const Title: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame - T.title;
  const letters = [...TITLE].map((ch, i) => {
    const st = 4 + i * 2;
    const d = f - st;
    const y = d < 0 ? -1200 : snap(interpolate(d, [0, 5], [-700, 0], { ...clamp, easing: Easing.in(Easing.quad) }));
    const bounce = d >= 5 && d < 9 ? [-24, -12, -4, 0][d - 5]! : 0;
    const sway = d >= 9 ? snap(Math.sin((frame + i * 4) / 6) * 8) : 0;
    return (
      <span key={i} style={{ display: "inline-block", transform: `translateY(${y + bounce + sway}px)`, width: ch === " " ? 80 : undefined }}>
        {ch}
      </span>
    );
  });
  const allIn = 4 + (TITLE.length - 1) * 2 + 5; // 最后一个字落地
  const landShake = f >= allIn && f < allIn + 8 ? snap((random(`ts${f}`) - 0.5) * 40) : 0;
  const bar = interpolate(f, [allIn, allIn + 10], [0, 1], clamp);
  const press = f > allIn + 14 && Math.floor(f / 8) % 2 === 0;
  return (
    <AbsoluteFill style={{ transform: `translate(${landShake}px, ${-landShake / 2}px)` }}>
      <Starfield frame={frame} />
      {/* 背后的旋转光（延续书的光） */}
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 44%, rgba(242,193,78,0.35) 0%, rgba(242,193,78,0) 45%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ transform: `translateY(-40px)`, display: "flex", alignItems: "center", gap: 48 }}>
          <div style={{ transform: `translateY(${f < 2 ? -900 : snap(interpolate(f, [2, 7], [-600, 0], clamp))}px)` }}>
            <Sprite def={BOOK} px={20} />
          </div>
          <div style={{ ...text(240, C.orange, C.ink, 20), letterSpacing: 24, filter: "drop-shadow(16px 16px 0 #000)" }}>{letters}</div>
        </div>
        <div style={{ width: snap(1300 * bar), height: 16, background: C.yellow, marginTop: 24, boxShadow: "8px 8px 0 #000" }} />
      </AbsoluteFill>
      <StartButton frame={frame} blinkOn={press} visible={f > allIn + 14} />
      <Cursor frame={frame} />
      {/* 点击后的确认白闪 */}
      <AbsoluteFill style={{ background: C.cream, opacity: interpolate(frame, [T.click + 2, T.click + 5, T.off + 2], [0, 0.85, 0], clamp) }} />
      {/* 落地白闪 */}
      <AbsoluteFill style={{ background: C.cream, opacity: interpolate(f, [allIn, allIn + 4], [0.7, 0], clamp) }} />
      <AbsoluteFill style={{ background: C.cream, opacity: interpolate(f, [0, 4], [1, 0], clamp) }} />
    </AbsoluteFill>
  );
};

/* ---------------- 6. 鼠标移到开始按钮并点击 ---------------- */
const BTN = { x: 960, y: 800, w: 560, h: 112 };

const StartButton: React.FC<{ frame: number; blinkOn: boolean; visible: boolean }> = ({ frame, blinkOn, visible }) => {
  if (!visible) return null;
  const hovered = frame >= T.hover;
  const pressed = frame >= T.click && frame < T.click + 4;
  const clicked = frame >= T.click;
  if (!hovered && !blinkOn && frame < T.cursorIn) return null;
  const bg = clicked ? (Math.floor((frame - T.click) / 2) % 2 ? C.yellow : C.cream) : hovered ? C.yellow : C.ink;
  const fg = hovered ? C.ink : C.yellow;
  const off = pressed ? 8 : 0;
  const arrows = hovered && Math.floor(frame / 4) % 2 === 0;
  return (
    <div
      style={{
        position: "absolute",
        left: BTN.x - BTN.w / 2 + off,
        top: BTN.y - BTN.h / 2 + off,
        width: BTN.w,
        height: BTN.h,
        background: bg,
        border: `8px solid ${hovered ? C.cream : C.yellow}`,
        boxShadow: pressed ? "none" : "12px 12px 0 #000",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <span style={{ ...text(48, fg), opacity: arrows ? 1 : 0 }}>{"\u25B6"}</span>
      <span style={text(56, fg)}>{"PRESS START"}</span>
      <span style={{ ...text(48, fg), opacity: arrows ? 1 : 0 }}>{"\u25C0"}</span>
    </div>
  );
};

const ARROW: { rows: string[]; colors: Record<string, string> } = {
  rows: [
    "K..........",
    "KK.........",
    "KWK........",
    "KWWK.......",
    "KWWWK......",
    "KWWWWK.....",
    "KWWWWWK....",
    "KWWWWWWK...",
    "KWWWWWWWK..",
    "KWWWWWWWWK.",
    "KWWWWWKKKKK",
    "KWWKWWK....",
    "KWK.KWWK...",
    "KK..KWWK...",
    "K....KWWK..",
    ".....KWWK..",
    "......KK...",
  ],
  colors: { K: "#000000", W: "#fffaf0" },
};

const Cursor: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < T.cursorIn) return null;
  const p = interpolate(frame, [T.cursorIn, T.hover], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  // 从右下角划进来，略带弧线
  const tx = BTN.x + 40;
  const ty = BTN.y + 8;
  const x = snap(interpolate(p, [0, 1], [1880, tx]) + Math.sin(p * Math.PI) * -60);
  const y = snap(interpolate(p, [0, 1], [1100, ty]) - Math.sin(p * Math.PI) * 140);
  const down = frame >= T.click && frame < T.click + 4;
  const ripple = frame >= T.click ? (frame - T.click) / 10 : -1;
  return (
    <>
      {ripple >= 0 && ripple <= 1 &&
        [0, 1].map((k) => {
          const s = snap(24 + (ripple - k * 0.25) * 260);
          if (s <= 0) return null;
          return (
            <div
              key={k}
              style={{
                position: "absolute",
                left: snap(tx - s / 2),
                top: snap(ty - s / 2),
                width: s,
                height: s,
                border: `8px solid ${C.cream}`,
                opacity: 1 - ripple,
              }}
            />
          );
        })}
      <div style={{ position: "absolute", left: x + (down ? 4 : 0), top: y + (down ? 4 : 0), filter: "drop-shadow(8px 8px 0 rgba(0,0,0,0.6))" }}>
        <Sprite def={ARROW} px={down ? 6 : 7} />
      </div>
    </>
  );
};

/* ---------------- 总装 ---------------- */
export const Intro: React.FC = () => {
  const frame = useCurrentFrame();

  // 回车后的震屏 + 故障
  const shaking = frame >= T.shake && frame < T.scene;
  const sx = shaking ? snap((random(`x${frame}`) - 0.5) * 120) : 0;
  const sy = shaking ? snap((random(`y${frame}`) - 0.5) * 80) : 0;
  const preShake = frame >= T.enter && frame < T.shake ? snap((random(`p${frame}`) - 0.5) * 16) : 0;

  let scene: React.ReactNode;
  if (frame < T.scene) scene = <Terminal frame={frame} />;
  else if (frame < T.arcade) scene = <Stage frame={frame} />;
  else if (frame < T.title) scene = <Arcade frame={frame} />;
  else scene = <Title frame={frame} />;

  // CRT 关机：压成一条线
  const off = interpolate(frame, [T.off, T.total - 3], [1, 0], clamp);
  const offScaleY = Math.max(0.004, off);
  const offScaleX = frame > T.total - 5 ? interpolate(frame, [T.total - 5, T.total - 1], [1, 0], clamp) : 1;

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${sx + preShake}px, ${sy}px) scale(${offScaleX}, ${offScaleY})`, filter: frame >= T.off ? `brightness(${1 + (1 - off) * 2})` : undefined }}>
        {scene}
        {shaking && <Glitch frame={frame} />}
        <CRT />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Glitch: React.FC<{ frame: number }> = ({ frame }) => {
  const colors = [C.red, C.blue, C.phosphor, C.yellow, C.purple, C.cream];
  const t = (frame - T.shake) / (T.scene - T.shake);
  return (
    <AbsoluteFill>
      {Array.from({ length: 8 + Math.floor(t * 14) }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: snap(random(`gx${frame}-${i}`) * W - 200),
            top: snap(random(`gy${frame}-${i}`) * H),
            width: snap(80 + random(`gw${frame}-${i}`) * 700),
            height: snap(8 + random(`gh${frame}-${i}`) * 56),
            background: colors[i % colors.length],
            opacity: 0.85,
          }}
        />
      ))}
      {frame % 3 === 0 && <AbsoluteFill style={{ background: C.cream, opacity: 0.25 + t * 0.6, mixBlendMode: "difference" }} />}
      {frame >= T.scene - 3 && <AbsoluteFill style={{ background: C.cream }} />}
    </AbsoluteFill>
  );
};
