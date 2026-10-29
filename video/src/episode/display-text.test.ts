import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type ComponentDeclarations,
  declareComponent,
  displayText,
} from "../components/declaration";
import { planEpisode } from "./episode-plan";

// 显示文字检查（#36）：组件上的每一段字都要出自本画面的画面说明或某个旁白句。
// 用 ep01 的真实合成清单（#34 的样例），组件是假的：一个显示文字参数是字符串，一个是字符串数组。
const MANIFEST = JSON.parse(
  readFileSync(new URL("fixtures/ep01-episode.json", import.meta.url), "utf8"),
) as { lines: { id: string; scene: string }[] };

const DECLARATIONS: ComponentDeclarations = {
  Sign: declareComponent({
    props: z.strictObject({
      text: displayText(z.string()),
      items: displayText(z.array(z.string())).optional(),
      /** 不是显示文字的字符串参数：不检查 */
      tone: z.string().optional(),
    }),
    states: ["normal"],
    cells: () => [1, 1],
    enter: "fade",
    exit: "fade",
    connector: false,
    sounds: { enter: null, exit: null, states: { normal: null } },
  }),
};

/** 在画面 `scene` 里放一个 Sign，参数是 `props`，在本画面第一句入场 */
const signIn = (scene: string, props: Record<string, unknown>) => {
  const line = MANIFEST.lines.find((l) => l.scene === scene)!;
  return planEpisode(
    MANIFEST,
    {
      scenes: [
        {
          scene,
          components: [{ id: "sign", component: "Sign", props, at: [0, 0] }],
          triggers: [
            { target: "sign", line: line.id, offset: 0, action: "enter" },
          ],
        },
      ],
      music: "pixel-sprinter",
      pauses: [],
    },
    DECLARATIONS,
  );
};

describe("planEpisode: 组件上的显示文字", () => {
  it.each([
    ["s01-c03", "解耦", "出自画面说明"],
    ["s01-c03", "单一职责", "出自画面说明"],
    ["s05-c05", "数据库 Schema", "出自画面说明，空白不计"],
    ["s05-c05", "数据库Schema", "少了空白也算"],
    ["s02-c02", "更容易改，还是更难改？", "出自旁白句原句"],
    ["s02-c02", "更容易改 还是更难改？", "逗号换成空白也算"],
    ["s01-c02", "提示14", "出自画面说明"],
    ["s01-c02", "提示１４", "全角数字经 NFKC 规范化后相同"],
    ["outro-c01", "下一期见", "片尾画面对照片尾的旁白句"],
  ])("画面 %s 里「%s」通过（%s）", (scene, text) => {
    expect(() => signIn(scene, { text })).not.toThrow();
  });

  it("出处里找不到的字报错，写明第几个画面、哪个组件、哪个参数、找不到的那段字", () => {
    expect(() => signIn("s05-c02", { text: "DRY——不要重复自己" })).toThrow(
      /第 1 个画面 第 1 个组件 props text: 组件 sign（Sign）的显示文字「DRY——不要重复自己」不在画面 s05-c02 的画面说明和旁白句里/,
    );
  });

  it("出自别的画面的字报错", () => {
    // 「解耦」在 s01-c03 的画面说明里，不在 s05-c02
    expect(() => signIn("s05-c02", { text: "解耦" })).toThrow(/「解耦」不在画面 s05-c02/);
  });

  it("片尾画面不对照别的画面", () => {
    expect(() => signIn("outro-c01", { text: "DRY" })).toThrow(/「DRY」不在画面 outro-c01/);
  });

  it("一项显示文字不能拼接两处出处", () => {
    // 「更容易变更」在 s01-l05 里，「好的设计」在 s01-l06 里，连起来哪里都没有
    expect(() => signIn("s01-c02", { text: "更容易变更好的设计" })).toThrow(
      /「更容易变更好的设计」不在画面 s01-c02/,
    );
  });

  it.each([
    ["", "空串"],
    ["，。", "只有标点，去掉后是空串"],
    [" ", "只有空白"],
  ])("显示文字「%s」报错（%s）", (text) => {
    expect(() => signIn("s01-c03", { text })).toThrow(/props text: .*空/);
  });

  it("字符串数组逐项检查：都出自本画面时通过", () => {
    expect(() =>
      signIn("s01-c03", { text: "解耦", items: ["解耦", "单一职责", "命名"] }),
    ).not.toThrow();
  });

  it("字符串数组里有一项不通过时报错，写明是第几项", () => {
    expect(() =>
      signIn("s01-c03", { text: "解耦", items: ["单一职责", "DRY"] }),
    ).toThrow(/props items \[1\]: 组件 sign（Sign）的显示文字「DRY」不在画面 s01-c03/);
  });

  it("字符串数组里有空串时报错", () => {
    expect(() => signIn("s01-c03", { text: "解耦", items: ["解耦", ""] })).toThrow(
      /props items \[1\]: .*空/,
    );
  });

  it("不是显示文字的参数不检查", () => {
    expect(() => signIn("s01-c03", { text: "解耦", tone: "warm" })).not.toThrow();
  });
});
