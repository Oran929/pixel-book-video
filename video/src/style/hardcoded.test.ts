import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findHardcodedStyle } from "./hardcoded";

describe("findHardcodedStyle", () => {
  it.each([
    ['backgroundColor: "#2b2b3a",', "颜色值"],
    ["color: '#FFF',", "三位颜色值"],
    ['color: "rgba(0, 0, 0, 0.5)",', "rgb 颜色"],
    ["fontSize: 48,", "数字尺寸"],
    ['padding: "24px 48px",', "字符串里的尺寸"],
    ["const ENTER_SECONDS = 0.4;", "小数"],
    ["translateY(${(progress - 1) * 160}px)", "表达式里的数字"],
  ])("找出写死的值：%s（%s）", (code) => {
    expect(findHardcodedStyle(`const a = 1;\n${code}\n`)).toEqual([
      { line: 2, text: code },
    ]);
  });

  it.each([
    ["fontSize: FONT_SIZE.subtitle,", "引用风格表"],
    ["border: border(SIZE.stroke, COLOR.ink),", "引用描边规则"],
    ["interpolate(frame, [0, end], [0, 1]);", "0 和 1"],
    ["// 字幕 64px，颜色 #f4ecd8", "行注释"],
    ["/* 方块 320px\n   #e07a3f */", "块注释"],
    ["{cues.map((cue) => <Entering cue={cue} />)}", "没有数字"],
    ['import { x } from "./schemas";', "import"],
  ])("不算写死：%s（%s）", (code) => {
    expect(findHardcodedStyle(code)).toEqual([]);
  });
});

// 字幕框（外壳）和组件只能引用风格表
const SCANNED = ["../shell/", "../components/"];

describe.each(SCANNED)("%s 里没有写死的颜色和尺寸", (dir) => {
  const url = new URL(dir, import.meta.url);
  const files = readdirSync(url).filter((name) => name.endsWith(".tsx"));

  it("目录里有组件文件", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s", (name) => {
    const source = readFileSync(new URL(name, url), "utf8");
    expect(findHardcodedStyle(source)).toEqual([]);
  });
});
