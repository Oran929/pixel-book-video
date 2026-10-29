// 小人的摆放和头顶符号的样子（#42）：每个人的图片画在哪、头顶的符号这一帧在哪、多不透明。
// 纯 .ts：Mascot.tsx 里不写 0、1 以外的数字（style/hardcoded.test.ts），位置和时间的算法放在这里。
import type { z } from "zod";
import { layoutGrid, type Rect } from "../style/grid";
import { MASCOT_SYMBOLS, MOTION, mascotSize, SIZE, snapToGrid } from "../style/style";
import { VIDEO } from "../video-config";
import {
  type MascotMember,
  type MascotProps,
  mascotCells,
  mascotGroup,
  mascotSymbolSize,
} from "./mascot-declaration";
import type { Stage } from "./stage";

export type MascotSymbol = keyof typeof MASCOT_SYMBOLS;

const isSymbol = (state: string | null): state is MascotSymbol =>
  state !== null && Object.hasOwn(MASCOT_SYMBOLS, state);

/** 一群里一个人在画面上的样子（相对组件左上角的屏幕像素） */
export type PlacedMascot = MascotMember & {
  /** 小人图片：在自己那块格子里底边对齐、水平居中，显示尺寸是原图的 1/2 */
  image: Rect;
  /** 头顶符号没有浮动时的位置：图片上沿往上空 `SIZE.mascotSymbolGap`，水平居中 */
  symbol: Rect;
};

/** 一群小人每人画在哪；后排的人排在前面（先画，被前排挡住） */
export const mascotPlacement = (props: z.infer<typeof MascotProps>): PlacedMascot[] => {
  const grid = layoutGrid(VIDEO.width, VIDEO.height);
  const [columns, rows] = mascotCells();
  const slot = { width: columns * grid.cellWidth, height: rows * grid.cellHeight };
  const symbol = mascotSymbolSize();
  return mascotGroup(props)
    .members.map((member) => {
      const { width, height } = mascotSize(member.character);
      const left = member.at[0] * grid.cellWidth;
      const bottom = member.at[1] * grid.cellHeight + slot.height;
      const image = {
        x: left + Math.round((slot.width - width) / 2),
        y: bottom - height,
        width,
        height,
      };
      return {
        ...member,
        image,
        symbol: {
          x: left + snapToGrid((slot.width - symbol.width) / 2),
          y: image.y - SIZE.mascotSymbolGap - symbol.height,
          ...symbol,
        },
      };
    })
    .sort((a, b) => Number(b.back) - Number(a.back));
};

/** 头顶符号这一帧的样子：哪个符号、相对静止位置往下偏多少（屏幕像素）、不透明度 */
export type SymbolLook = { symbol: MascotSymbol; offset: number; opacity: number };

const frames = (seconds: number) => Math.max(1, Math.round(seconds * VIDEO.fps));

/**
 * 头顶符号这一帧的样子。切到 `question`、`exclaim`：符号从下面 `SIZE.mascotSymbolRise` 处
 * 一边升上来一边淡入（一个通用动画的时长），之后每 `MOTION.mascotSymbolBobSeconds` 秒
 * 上下换一次位置。切回 `normal`：原来的符号原地淡出。没有符号时为 null。
 */
export const symbolLook = (stage: Stage): SymbolLook | null => {
  const t = Math.min(1, stage.stateFrames / frames(MOTION.animationSeconds));
  if (isSymbol(stage.state)) {
    if (t < 1) {
      return { symbol: stage.state, offset: snapToGrid((1 - t) * SIZE.mascotSymbolRise), opacity: t };
    }
    const bob = Math.floor(stage.stateFrames / frames(MOTION.mascotSymbolBobSeconds)) % 2;
    return { symbol: stage.state, offset: -bob * SIZE.mascotSymbolBob, opacity: 1 };
  }
  if (isSymbol(stage.previousState) && t < 1) {
    return { symbol: stage.previousState, offset: 0, opacity: 1 - t };
  }
  return null;
};

/**
 * 符号点阵里亮着的点：`dot` 是点本身，`outline` 是往外扩一圈描边宽的方块
 * （先把所有 `outline` 涂成 `ink`，再在上面画点，拼成方方的描边）。相对符号左上角，屏幕像素。
 */
export const symbolDots = (symbol: MascotSymbol): { dot: Rect; outline: Rect }[] =>
  MASCOT_SYMBOLS[symbol].flatMap((row, y) =>
    [...row].flatMap((cell, x) => {
      if (cell !== "#") return [];
      const left = x * SIZE.mascotSymbolDot;
      const top = y * SIZE.mascotSymbolDot;
      return [
        {
          dot: {
            x: left + SIZE.mascotSymbolOutline,
            y: top + SIZE.mascotSymbolOutline,
            width: SIZE.mascotSymbolDot,
            height: SIZE.mascotSymbolDot,
          },
          outline: {
            x: left,
            y: top,
            width: SIZE.mascotSymbolDot + 2 * SIZE.mascotSymbolOutline,
            height: SIZE.mascotSymbolDot + 2 * SIZE.mascotSymbolOutline,
          },
        },
      ];
    }),
  );
