// 组件的渲染接口（#35）：组件拿到自己的参数，加上舞台信息——当前状态、进入当前状态以来的帧数、
// 入场和退场的进度——自己决定怎么画、怎么动。通用的入场和退场动画由 Staged 套在外面。
// 纯 .ts、不引用 React/remotion，舞台信息在 Node 里也能算（测试）。
import type { Cue, CueAction } from "../episode/storyboard";
import type { Rect } from "../style/grid";

/** 某一帧的舞台信息 */
export type Stage = {
  /** 当前状态：入场时是组件声明的第一个状态，之后按分镜的切换状态触发变化 */
  state: string;
  /**
   * 切到当前状态之前的状态（组件从哪个状态变过来，比如撤掉路障时要知道路障在哪条路）；
   * 还没切换过状态时为 null
   */
  previousState: string | null;
  /** 进入当前状态以来的帧数：进入这个状态的那一帧是 0（初始状态从入场帧算起） */
  stateFrames: number;
  /** 入场动画的进度，0 → 1（线性）；播完以后、或入场动画是 `none` 时为 1 */
  enter: number;
  /** 退场动画的进度，0 → 1（线性）；退场之前为 0 */
  exit: number;
  /**
   * 入场和退场用的动画（没有退场时 `exitAnimation` 为 null）。`fade`、`slide` 由 Staged 套在外面；
   * 组件自己的特殊效果（声明的 `effects`）由组件按 `enter`、`exit` 的进度自己画。
   */
  enterAnimation: string;
  exitAnimation: string | null;
};

/** 连线类组件（箭头）两端组件在画面上的矩形（屏幕像素，含右下的硬阴影） */
export type Ends = { from: Rect; to: Rect };

/**
 * 组件实现拿到的 props：分镜里的参数 `props`（已按声明校验）、舞台信息 `stage`，
 * 连线类组件还拿到两端的矩形 `ends`（其余组件为 null）
 */
export type RenderProps<Props> = { props: Props; stage: Stage; ends: Ends | null };

// 从 `from` 帧起播 `frames` 帧的动画，到 `frame` 时的线性进度；0 帧（`none`）一开始就是 1
const progress = (frame: number, { frame: from, frames }: CueAction) => {
  if (frame < from) return 0;
  if (frames === 0) return 1;
  return Math.min(1, (frame - from) / frames);
};

/** 组件在整期第 `frame` 帧的舞台信息（`frame` 应落在 `cue` 的区间里） */
export const stageAt = (cue: Cue, frame: number): Stage => {
  const index = cue.states.findLastIndex((switched) => switched.frame <= frame);
  const current = cue.states[index];
  return {
    state: current?.state ?? cue.initialState,
    previousState: current ? (cue.states[index - 1]?.state ?? cue.initialState) : null,
    stateFrames: frame - (current?.frame ?? cue.enter.frame),
    enter: progress(frame, cue.enter),
    exit: cue.exit ? progress(frame, cue.exit) : 0,
    enterAnimation: cue.enter.animation,
    exitAnimation: cue.exit?.animation ?? null,
  };
};
