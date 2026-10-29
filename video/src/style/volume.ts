// 音量（#37）：旁白、音效、配乐三者的音量放在一处，到人工关口 3 再调。
// 用 dB 写（相对旁白），换算成 Remotion `volume` 要的 0–1 线性值，以旁白为 1。

/** 各路声音相对旁白的音量（dB，≤ 0） */
export const VOLUME_DB = {
  narration: 0,
  /** 音效只作点缀；几个方块同时入场时叠加也不削波（见 #37 的峰值检查） */
  sfx: -12,
  /**
   * 配乐垫在旁白下面，初值 -20 dB（spec #16 用户故事 49）。音量有变化的那段（带淡出的最后
   * 一次循环）Remotion 会取整到 1/97 的整数倍，0.1 变成 10/97（约 -19.7 dB），见 #39
   */
  music: -20,
} as const;

/** dB → 线性增益：0 dB 是 1，-20 dB 是 0.1 */
export const decibelsToGain = (db: number): number => 10 ** (db / 20);

/** 交给 Remotion 的线性音量（以旁白为 1） */
export const VOLUME = {
  narration: decibelsToGain(VOLUME_DB.narration),
  sfx: decibelsToGain(VOLUME_DB.sfx),
  music: decibelsToGain(VOLUME_DB.music),
} as const;
