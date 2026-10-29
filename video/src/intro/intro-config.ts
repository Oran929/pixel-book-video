// 片头（#50，spec #16 修订二）：用户做好的一段固定动画，每期都一样，放在最前面。
// 时间轴只需要它的帧数和音轨，所以这里不引用 React 和 remotion（Node 里的时间轴导出也用）。
import timing from "./timing.json";

export const INTRO = {
  /** 片头占的帧数（30fps，约 14.07 秒）：`timing.json` 的 `total` */
  frames: timing.total,
  /** 片头自带的音轨（音乐和音效一体），以 `video/public/` 为起点；由 `make_audio.py` 生成 */
  audio: "intro/intro-audio.wav",
} as const;
