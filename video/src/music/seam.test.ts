import { describe, expect, it } from "vitest";
import { measureCrossfade } from "./seam";

const RATE = 48000;
const SECONDS = 4;
const COUNT = RATE * SECONDS;
// 30fps、1 秒交叉淡化：重叠 48000 个采样
const OVERLAP = RATE;

/** 单声道：每个采样按 f(第几个采样) 算 */
const mono = (f: (i: number) => number) => ({
  samples: Float32Array.from({ length: COUNT }, (_, i) => f(i)),
  channels: 1,
  sampleRate: RATE,
});

/** 确定的伪随机噪声（-1 到 1），曲尾和曲首互不相关 */
const noise = (seed: number) => {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return (x / 2 ** 31) * 2 - 1;
  };
};

describe("measureCrossfade：曲尾和曲首重叠 1 秒交叉淡化", () => {
  it("曲尾和曲首互不相关、一样响时，重叠处不掉音也不爆音", () => {
    const next = noise(1);
    const seam = measureCrossfade(mono(() => 0.3 * next()));
    expect(seam.problems).toEqual([]);
    // 等功率交叉淡化：重叠处和两侧一样响（相差不到 1 dB）
    expect(Math.abs(seam.overlapDb - seam.beforeDb)).toBeLessThan(1);
    expect(Math.abs(seam.overlapDb - seam.afterDb)).toBeLessThan(1);
  });

  it("曲尾和曲首反相（重叠处互相抵消）时报掉音", () => {
    // 曲首是正弦，曲尾的最后 1 秒正好是曲首前 1 秒反过来
    const wave = (i: number) => 0.5 * Math.sin((2 * Math.PI * i) / 100);
    const seam = measureCrossfade(mono((i) => (i >= COUNT - OVERLAP ? -wave(i - (COUNT - OVERLAP)) : wave(i))));
    expect(seam.problems).toEqual([expect.stringContaining("掉音")]);
  });

  it("重叠处比两侧响得多时报爆音", () => {
    // 曲首前半秒很响，之后和曲尾一样轻
    const next = noise(2);
    const seam = measureCrossfade(mono((i) => (i < RATE / 2 ? 0.9 : 0.03) * next()));
    expect(seam.problems).toEqual([expect.stringContaining("爆音")]);
  });

  it("曲子自然淡出到很轻，但交叉淡化本身不丢响度，不算掉音", () => {
    // 曲尾最后 2 秒从 0.3 线性降到 0.003（像歌曲结尾的淡出），曲首照常
    const next = noise(3);
    const fadeStart = COUNT - 2 * RATE;
    const seam = measureCrossfade(
      mono((i) => (i < fadeStart ? 0.3 : 0.3 - (0.297 * (i - fadeStart)) / (2 * RATE)) * next()),
    );
    expect(seam.problems).toEqual([]);
    // 报出曲尾比曲子整体轻多少，留给人工关口听
    expect(seam.tailBelowTrackDb).toBeGreaterThan(6);
  });
});
