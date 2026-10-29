import { describe, expect, it } from "vitest";
import { measureSeam } from "./seam";
import { stretchLoop } from "./stretch";

const RATE = 44100;

describe("stretchLoop：把一段循环按周期重采样到指定的采样数", () => {
  // 1 秒里正好 441 个周期的正弦波，拉长 630 个采样（Pixel Sprinter 的量级）后仍是 441 个周期
  const count = RATE;
  const target = RATE + 630;
  const source = {
    samples: Float32Array.from({ length: count * 2 }, (_, n) => {
      const i = Math.floor(n / 2);
      return (n % 2 === 0 ? 0.5 : -0.25) * Math.sin((2 * Math.PI * 441 * i) / count);
    }),
    channels: 2,
    sampleRate: RATE,
  };
  const stretched = stretchLoop(source, target);

  it("输出的采样数就是目标值，声道数和采样率不变", () => {
    expect(stretched.samples.length).toBe(target * 2);
    expect(stretched.channels).toBe(2);
    expect(stretched.sampleRate).toBe(RATE);
  });

  it("波形按比例拉长，各声道分开算（误差小于 0.001）", () => {
    let error = 0;
    for (let i = 0; i < target; i++) {
      const wave = Math.sin((2 * Math.PI * 441 * i) / target);
      error = Math.max(
        error,
        Math.abs(stretched.samples[2 * i]! - 0.5 * wave),
        Math.abs(stretched.samples[2 * i + 1]! + 0.25 * wave),
      );
    }
    expect(error).toBeLessThan(0.001);
  });

  it("曲尾仍接得上曲首", () => {
    expect(measureSeam(stretched).seamless).toBe(true);
  });

  it("采样数已经是目标值时原样返回", () => {
    expect(stretchLoop(source, count).samples).toEqual(source.samples);
  });
});
