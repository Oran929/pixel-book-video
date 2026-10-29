import { describe, expect, it } from "vitest";
import { CROSSFADE_FRAMES, musicPlays, musicVolume } from "./crossfade";

// 正文第 0–249 帧（不含 250），最后 60 帧淡出
const MUSIC = { track: "forgotten-path", startFrame: 0, endFrame: 250, fadeFrom: 190 } as const;

describe("musicPlays：曲子比正片短时循环，每个接缝重叠 1 秒交叉淡化", () => {
  it("交叉淡化重叠 30 帧（1 秒）", () => {
    expect(CROSSFADE_FRAMES).toBe(30);
  });

  it("曲长 100 帧：每次循环比上一次晚 70 帧开始，和上一次的最后 30 帧重叠；最后一次在正文结束处截断", () => {
    expect(musicPlays(MUSIC, 100)).toEqual([
      { from: 0, to: 100, fadeIn: null, fadeOut: { from: 70, to: 100 } },
      { from: 70, to: 170, fadeIn: { from: 70, to: 100 }, fadeOut: { from: 140, to: 170 } },
      { from: 140, to: 240, fadeIn: { from: 140, to: 170 }, fadeOut: { from: 210, to: 240 } },
      { from: 210, to: 250, fadeIn: { from: 210, to: 240 }, fadeOut: null },
    ]);
  });

  it("配乐从片头结束开始时，循环的起点跟着后移", () => {
    const plays = musicPlays({ ...MUSIC, startFrame: 422, endFrame: 672 }, 100);
    expect(plays.map((play) => play.from)).toEqual([422, 492, 562, 632]);
  });

  it("比正片长（或一样长）的曲子不循环，只放一次，在正文结束处截断", () => {
    expect(musicPlays(MUSIC, 400)).toEqual([{ from: 0, to: 250, fadeIn: null, fadeOut: null }]);
    expect(musicPlays(MUSIC, 250)).toEqual([{ from: 0, to: 250, fadeIn: null, fadeOut: null }]);
  });

  it("曲子不比两段交叉淡化长时报错", () => {
    expect(() => musicPlays(MUSIC, 60)).toThrow("曲子只有 60 帧，循环要比两段交叉淡化（60 帧）长");
  });
});

describe("musicVolume：每次循环每一帧的音量", () => {
  const plays = musicPlays(MUSIC, 100);
  const [first, second] = plays;

  it("交叉淡化以外是配乐音量（-20 dB = 0.1）", () => {
    expect(musicVolume(MUSIC, first!, 0)).toBeCloseTo(0.1, 6);
    expect(musicVolume(MUSIC, first!, 69)).toBeCloseTo(0.1, 6);
    expect(musicVolume(MUSIC, second!, 100)).toBeCloseTo(0.1, 6);
  });

  it("等功率曲线：曲首按 sin 淡入、曲尾按 cos 淡出，每帧取帧中点", () => {
    // 重叠的第 0、15、29 帧：sin(π/2 · (k + 0.5) / 30)、cos(π/2 · (k + 0.5) / 30)
    expect(musicVolume(MUSIC, second!, 70)).toBeCloseTo(0.1 * 0.0262, 4);
    expect(musicVolume(MUSIC, first!, 70)).toBeCloseTo(0.1 * 0.9997, 4);
    expect(musicVolume(MUSIC, second!, 85)).toBeCloseTo(0.1 * 0.7254, 4);
    expect(musicVolume(MUSIC, first!, 85)).toBeCloseTo(0.1 * 0.6884, 4);
    expect(musicVolume(MUSIC, second!, 99)).toBeCloseTo(0.1 * 0.9997, 4);
    expect(musicVolume(MUSIC, first!, 99)).toBeCloseTo(0.1 * 0.0262, 4);
  });

  it("重叠处两份的功率加起来不变（曲尾和曲首不相关时响度不掉）", () => {
    for (let frame = 70; frame < 100; frame++) {
      const power = musicVolume(MUSIC, first!, frame) ** 2 + musicVolume(MUSIC, second!, frame) ** 2;
      expect(power).toBeCloseTo(0.01, 8);
    }
  });

  it("正文最后 60 帧在交叉淡化之上再线性淡出，到正文结束归零", () => {
    const last = plays.at(-1)!;
    expect(musicVolume(MUSIC, last, 189)).toBeCloseTo(0.1, 6);
    expect(musicVolume(MUSIC, last, 245)).toBeCloseTo(0.1 * (5 / 60), 6);
    // 第 220 帧：淡入的第 10 帧，sin(π/2 · 10.5 / 30) ≈ 0.5225；淡出走了 30/60
    expect(musicVolume(MUSIC, last, 220)).toBeCloseTo(0.1 * 0.5225 * 0.5, 4);
  });
});
