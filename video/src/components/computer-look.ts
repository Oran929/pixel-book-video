// 电脑各状态的样子（#41）：从舞台信息算出这一帧屏幕什么颜色、抖到哪、花屏横条在哪、光标亮不亮。
// 纯 .ts：Computer.tsx 里不写 0、1 以外的数字（style/hardcoded.test.ts），时间和位置的算法放在这里。
import { COLOR, MOTION, SIZE } from "../style/style";
import { VIDEO } from "../video-config";
import type { ComputerState } from "./declarations";
import type { Stage } from "./stage";

const frames = (seconds: number) => Math.max(1, Math.round(seconds * VIDEO.fps));

/** 花屏横条：每换一下颜色换一组位置，按屏幕高度的几分之几排开 */
const GLITCH_SLOTS = 7;
const GLITCH_BARS = 3;

export type ComputerLook = {
  /** 整台电脑左右抖动的位移（屏幕像素，像素网格的整数倍） */
  shake: number;
  screen: string;
  text: string;
  /** 每行字往右下错开多少（崩溃后错开，正常时为 0） */
  slip: number;
  /** 花屏横条的上沿，按屏幕高度的比例（0 → 1）；不花屏时为空 */
  glitch: number[];
  /** 光标亮着吗（崩溃时不显示光标） */
  cursor: boolean;
};

/**
 * 电脑这一帧的样子。`normal`：深色屏幕、绿字，字后面一个光标一亮一灭。
 * `crashed`：切过来的头 `MOTION.computerCrashSeconds` 秒左右抖动、红白闪屏、冒出花屏横条，
 * 之后停在蓝屏，每行字比上一行往右下多错开一点。
 */
export const computerLook = (stage: Stage): ComputerLook => {
  const state = stage.state as ComputerState;
  if (state === "normal") {
    const blink = Math.floor(stage.stateFrames / frames(MOTION.cursorBlinkSeconds));
    return {
      shake: 0,
      screen: COLOR.computerScreen,
      text: COLOR.computerText,
      slip: 0,
      glitch: [],
      cursor: blink % 2 === 0,
    };
  }
  const crashing = stage.stateFrames < frames(MOTION.computerCrashSeconds);
  if (!crashing) {
    return {
      shake: 0,
      screen: COLOR.computerCrashScreen,
      text: COLOR.computerCrashText,
      slip: SIZE.computerSlip,
      glitch: [],
      cursor: false,
    };
  }
  const step = Math.floor(stage.stateFrames / frames(MOTION.computerFlickerSeconds));
  const odd = step % 2 === 1;
  return {
    shake: odd ? SIZE.computerShake : -SIZE.computerShake,
    screen: odd ? COLOR.computerFlash : COLOR.computerFlashAlt,
    text: odd ? COLOR.computerFlashAlt : COLOR.computerFlash,
    slip: SIZE.computerSlip,
    glitch: Array.from(
      { length: GLITCH_BARS },
      (_, i) => ((step * 3 + i * 5) % GLITCH_SLOTS) / GLITCH_SLOTS,
    ),
    cursor: false,
  };
};
