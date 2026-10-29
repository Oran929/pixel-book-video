// 提示牌「亮起」的样子（#41）：从亮起的进度算出这一帧亮没亮、外面那圈光在哪。
// 纯 .ts：HintSign.tsx 里不写 0、1 以外的数字（style/hardcoded.test.ts），时间点放在这里。
import { SIZE, snapToGrid } from "../style/style";
import type { Stage } from "./stage";

/** 亮起的过程（进度 0 → 1）：先闪一下、灭掉，从一半起亮住 */
const FLASH = { from: 0.2, until: 0.35 } as const;
const STEADY = 0.5;

/**
 * 亮起的进度：入场用 `light` 时是入场进度；退场用 `light` 时倒着播（熄灭）；
 * 用通用动画入场和退场时一直是 1（亮着，淡入、落下由 Staged 套在外面）
 */
export const lightProgress = (stage: Stage, effect: string): number => {
  const entering = stage.enterAnimation === effect ? stage.enter : 1;
  const leaving = stage.exitAnimation === effect ? 1 - stage.exit : 1;
  return Math.min(entering, leaving);
};

/**
 * 进度 `t` 时提示牌亮没亮，以及外面那圈光离牌子多远（null 表示没有光）：
 * 亮住以后光圈从牌子边上往外扩，亮起播完时消失
 */
export const hintLight = (t: number): { lit: boolean; glowOffset: number | null } => {
  const lit = (t >= FLASH.from && t < FLASH.until) || t >= STEADY;
  const glowing = t >= STEADY && t < 1;
  return {
    lit,
    glowOffset: glowing
      ? snapToGrid(((t - STEADY) / (1 - STEADY)) * 2 * SIZE.hintGlow)
      : null,
  };
};
