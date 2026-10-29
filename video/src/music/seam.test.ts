import { describe, expect, it } from "vitest";
import { measureSeam } from "./seam";

const RATE = 44100;

/** 单声道：每个采样按 f(第几个采样) 算 */
const mono = (count: number, f: (i: number) => number) => ({
  samples: Float32Array.from({ length: count }, (_, i) => f(i)),
  channels: 1,
  sampleRate: RATE,
});

describe("measureSeam：曲尾接回曲首", () => {
  it("整数个周期的正弦波接得上，是无缝的", () => {
    // 441 Hz，每个周期 100 个采样，1 秒正好 441 个周期
    const seam = measureSeam(mono(RATE, (i) => 0.5 * Math.sin((2 * Math.PI * i) / 100)));
    expect(seam.seamless).toBe(true);
    expect(seam.problems).toEqual([]);
  });

  it("曲尾停在半截、曲首从 0 开始，接缝处的采样差远大于两侧，不无缝", () => {
    // 曲尾是平滑的高电平（像没响完的余音），曲首从 0 开始
    const seam = measureSeam(mono(RATE, (i) => (i < 1000 ? 0 : 0.3 + 0.01 * Math.sin(i / 50))));
    expect(seam.seamless).toBe(false);
    expect(seam.problems).toEqual([expect.stringContaining("采样差")]);
  });

  it("曲尾是一段静音，接上曲首时响度跳变，不无缝", () => {
    const seam = measureSeam(mono(RATE, (i) => (i < RATE - 4410 ? 0.5 * Math.sin((2 * Math.PI * i) / 100) : 0)));
    expect(seam.seamless).toBe(false);
    expect(seam.problems).toEqual(expect.arrayContaining([expect.stringContaining("RMS")]));
  });

  it("立体声按声道分开算，只有一个声道断开也不无缝", () => {
    const left = (i: number) => 0.5 * Math.sin((2 * Math.PI * i) / 100);
    const right = (i: number) => (i < 1000 ? 0 : 0.3);
    const samples = new Float32Array(RATE * 2);
    for (let i = 0; i < RATE; i++) {
      samples[2 * i] = left(i);
      samples[2 * i + 1] = right(i);
    }
    const seam = measureSeam({ samples, channels: 2, sampleRate: RATE });
    expect(seam.seamless).toBe(false);
  });
});
