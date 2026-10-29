// 按周期重采样（#38）：把一段循环整体拉长或缩短到指定的采样数，用来把配乐的采样数
// 对齐到一帧的整数倍。把曲子当成首尾相接的环来插值（下标对长度取模），
// 所以接缝处仍是曲尾接曲首；不是裁剪（少一截）也不是补零（多一段静音）。
// 插值核是 Blackman 窗的 sinc，单侧 HALF_TAPS 个采样；拉伸比例离 1 不到千分之一，
// 截止频率取奈奎斯特频率的 CUTOFF 倍。
import type { PcmAudio } from "./seam";

const HALF_TAPS = 32;
const CUTOFF = 0.98;

export const stretchLoop = (audio: PcmAudio, target: number): PcmAudio => {
  const { samples, channels } = audio;
  const count = samples.length / channels;
  if (count === target) return audio;
  const out = new Float32Array(target * channels);
  const step = count / target;
  const taps = new Float64Array(2 * HALF_TAPS);
  for (let k = 0; k < target; k++) {
    const t = k * step;
    const base = Math.floor(t);
    const frac = t - base;
    // 第 j 个采样离 t 的距离 d = (base + j) - t，j 从 -HALF_TAPS + 1 到 HALF_TAPS
    let sum = 0;
    for (let j = -HALF_TAPS + 1; j <= HALF_TAPS; j++) {
      const d = j - frac;
      const x = Math.PI * CUTOFF * d;
      const sinc = x === 0 ? 1 : Math.sin(x) / x;
      const w = 0.42 + 0.5 * Math.cos((Math.PI * d) / HALF_TAPS) + 0.08 * Math.cos((2 * Math.PI * d) / HALF_TAPS);
      const tap = CUTOFF * sinc * w;
      taps[j + HALF_TAPS - 1] = tap;
      sum += tap;
    }
    for (let c = 0; c < channels; c++) {
      let value = 0;
      for (let j = -HALF_TAPS + 1; j <= HALF_TAPS; j++) {
        const index = (((base + j) % count) + count) % count;
        value += samples[index * channels + c]! * taps[j + HALF_TAPS - 1]!;
      }
      // 按核的总和归一，直流增益正好是 1
      out[k * channels + c] = value / sum;
    }
  }
  return { ...audio, samples: out };
};
