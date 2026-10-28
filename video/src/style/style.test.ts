import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FONT,
  FONT_SIZE,
  GRID,
  LINE_HEIGHT,
  MASCOT,
  MASCOTS,
  SIZE,
} from "./style";

// Fusion Pixel 12px：字形按 12×12 像素格设计，字号只能是 12 的整数倍才不模糊
const FUSION_PIXEL_DESIGN_SIZE = 12;

describe("风格表", () => {
  it("用 12px 设计的像素字体，字体文件在 public/fonts/ 里", () => {
    expect(FONT.designSize).toBe(FUSION_PIXEL_DESIGN_SIZE);
    expect(existsSync(new URL(`../../public/${FONT.file}`, import.meta.url))).toBe(
      true,
    );
  });

  it.each(Object.entries(FONT_SIZE))(
    "字号 %s = %ipx 是设计尺寸的整数倍",
    (_, size) => {
      expect(size % FUSION_PIXEL_DESIGN_SIZE).toBe(0);
      expect(size).toBeGreaterThan(0);
    },
  );

  it.each(Object.entries(FONT_SIZE))(
    "字号 %s 的行高落在整像素上，是字体像素的整数倍",
    (name, size) => {
      const fontPixel = size / FUSION_PIXEL_DESIGN_SIZE;
      expect(LINE_HEIGHT[name as keyof typeof LINE_HEIGHT] % fontPixel).toBe(0);
    },
  );

  it("像素网格是字幕字号下字体的一个像素", () => {
    expect(GRID).toBe(FONT_SIZE.subtitle / FUSION_PIXEL_DESIGN_SIZE);
  });

  it.each(Object.entries(SIZE))("尺寸 %s = %ipx 是像素网格的整数倍", (_, size) => {
    expect(Number.isInteger(size / GRID)).toBe(true);
  });

  it("频道小人按整数倍显示", () => {
    expect(Number.isInteger(MASCOT.scale)).toBe(true);
    expect(MASCOT.scale).toBeGreaterThan(0);
  });

  it.each(Object.entries(MASCOTS))(
    "小人 %s 记录的尺寸和图片文件一致",
    (_, { file, width, height }) => {
      // PNG 的 IHDR 块：第 16–23 字节是宽和高（大端）
      const png = readFileSync(new URL(`../../public/${file}`, import.meta.url));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height]);
    },
  );
});
