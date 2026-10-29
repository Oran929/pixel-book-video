import { describe, expect, it } from "vitest";
import { computerLook, lineOffset } from "./computer-look";
import type { Stage } from "./stage";

const stage = (state: string, stateFrames: number): Stage => ({
  state,
  previousState: state === "normal" ? null : "normal",
  stateFrames,
  enter: 1,
  exit: 0,
  enterAnimation: "fade",
  exitAnimation: null,
});

describe("电脑屏幕上每行字的位置", () => {
  it("正常时每行字都顶着左边，不错开", () => {
    const look = computerLook(stage("normal", 10));
    expect([0, 1, 2].map((i) => lineOffset(look, i))).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it("崩溃后每行字只往下错开，第二行开头不往右缩进（#41 样帧 f120 看着像多了一个空格）", () => {
    const look = computerLook(stage("crashed", 90));
    const offsets = [0, 1, 2].map((i) => lineOffset(look, i));
    expect(offsets.map((o) => o.x)).toEqual([0, 0, 0]);
    expect(offsets[1]!.y).toBeGreaterThan(0);
    expect(offsets[2]!.y).toBeGreaterThan(offsets[1]!.y);
  });
});
