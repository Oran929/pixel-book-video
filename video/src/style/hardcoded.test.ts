import { readdirSync, readFileSync } from "node:fs";
import { sep } from "node:path";
import { describe, expect, it } from "vitest";
import { findFixedText, findHardcodedStyle } from "./hardcoded";

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

describe("findFixedText", () => {
  it.each([
    ["<div>ERROR</div>", "标签里的英文"],
    ["提示</span>", "开始标签在上一行"],
    ['<div>{"ERROR"}</div>', "花括号里的字符串"],
    ["<b>{'错误'}</b>", "单引号"],
    ["<b>{`错误`}</b>", "模板字符串"],
  ])("找出写死的字：%s（%s）", (code) => {
    expect(findFixedText(`const a = 1;\n${code}\n`)).toEqual([
      { line: 2, text: code },
    ]);
  });

  it.each([
    ["<div>{label}</div>", "从参数来"],
    ["{cues.map((cue) => <Entering cue={cue} />)}", "没有字"],
    ['style={{ position: "absolute" }}', "样式里的字符串"],
    ["const t = a > b && c < d;", "比较"],
    ["// <b>ERROR</b>", "注释"],
    ["<div> </div>", "只有空白"],
  ])("不算写死：%s（%s）", (code) => {
    expect(findFixedText(code)).toEqual([]);
  });
});

// 组件（包括常驻组件字幕和主题）只能引用风格表；递归扫描，子目录里的组件也查
const COMPONENTS_DIR = new URL("../components/", import.meta.url);
const files = readdirSync(COMPONENTS_DIR, { recursive: true, encoding: "utf8" })
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => name.split(sep).join("/"))
  .sort();

describe("组件目录里没有写死的颜色和尺寸", () => {
  it("扫描到子目录里的常驻组件", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "resident/EpisodeTitle.tsx",
        "resident/Subtitle.tsx",
        "PixelBlock.tsx",
      ]),
    );
  });

  it.each(files)("%s", (name) => {
    const source = readFileSync(new URL(name, COMPONENTS_DIR), "utf8");
    expect(findHardcodedStyle(source)).toEqual([]);
  });
});

describe("组件目录里没有写死的显示文字", () => {
  it.each(files)("%s", (name) => {
    const source = readFileSync(new URL(name, COMPONENTS_DIR), "utf8");
    expect(findFixedText(source)).toEqual([]);
  });
});
