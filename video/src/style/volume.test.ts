import { describe, expect, it } from "vitest";
import { decibelsToGain, VOLUME } from "./volume";

describe("音量", () => {
  it.each([
    [0, 1],
    [-20, 0.1],
    [-40, 0.01],
    [-6.0206, 0.5],
  ])("%s dB 换算成线性值 %s", (db, gain) => {
    expect(decibelsToGain(db)).toBeCloseTo(gain, 4);
  });

  it("以旁白为 1，音效和配乐都比旁白低", () => {
    expect(VOLUME.narration).toBe(1);
    expect(VOLUME.sfx).toBeLessThan(1);
    expect(VOLUME.music).toBeLessThan(1);
  });
});
