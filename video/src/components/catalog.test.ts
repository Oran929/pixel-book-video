import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { CATALOG_DIR, generateCatalog } from "./catalog";
import { declareComponent } from "./declaration";
import { COMPONENT_DECLARATIONS } from "./declarations";

// 组件目录（GLOSSARY「组件目录」，#60）：`docs/reference/components/` 由 `npm run catalog`
// 从组件声明生成并提交，是 `/storyboard` 了解组件的唯一出处。

const names = Object.keys(COMPONENT_DECLARATIONS);
const catalog = generateCatalog(COMPONENT_DECLARATIONS);

describe("组件目录和已提交的文件一致", () => {
  it("目录里正好是生成的这些文件（多了、少了都要跑 `npm run catalog`）", () => {
    expect(readdirSync(CATALOG_DIR).sort(), "跑 `cd video && npm run catalog` 重新生成").toEqual(
      Object.keys(catalog).sort(),
    );
  });

  it.each(Object.keys(catalog))("%s 和生成结果逐字一致", (file) => {
    const committed = readFileSync(new URL(file, CATALOG_DIR), "utf8");
    expect(committed, `${file} 过期了：跑 \`cd video && npm run catalog\``).toBe(catalog[file]);
  });
});

describe("目录页", () => {
  const index = catalog["index.md"]!;
  /** 目录表里每一行链接到的组件名：`[中文名 \`组件名\`](组件名.md)` */
  const listed = [...index.matchAll(/^\| \[[^\]]*`(\w+)`\]\((\w+)\.md\) \|/gm)].map(
    ([, name, file]) => {
      expect(file).toBe(name);
      return name;
    },
  );

  it("每个登记的组件正好一行，没有多出来的", () => {
    expect([...listed].sort()).toEqual([...names].sort());
  });

  it("写出了每个组件的效果和适合表达", () => {
    for (const declared of Object.values(COMPONENT_DECLARATIONS)) {
      expect(index).toContain(declared.effect);
      expect(index).toContain(declared.suitedFor);
    }
  });

  it("每个组件一页详情", () => {
    expect(Object.keys(catalog).sort()).toEqual(["index.md", ...names.map((name) => `${name}.md`)].sort());
  });
});

describe("详情页", () => {
  it("知识块：参数表写出类型、必填和取值范围，标出显示文字", () => {
    const page = catalog["PixelBlock.md"]!;
    expect(page).toMatch(/^# 知识块 `PixelBlock`$/m);
    expect(page).toContain("| `label` | 字符串 | 必填 | 不空 | 是 |");
    expect(page).toContain("| `size` | 字符串 | 必填 | `small`、`medium`、`large` | 否 |");
  });

  it("小人：可选参数和整数范围", () => {
    const page = catalog["Mascot.md"]!;
    expect(page).toContain("| `count` | 整数 | 可选 | ≥ 1 | 否 |");
    expect(page).toContain(
      "| `character` | 字符串，或字符串数组 | 必填 | `dragon`、`reader`、`whale`、`gothic`；数组至少 1 项 | 否 |",
    );
  });

  it("时间线：数组项数范围", () => {
    expect(catalog["Timeline.md"]).toContain("| `nodes` | 字符串数组 | 必填 | 2–6 项，每项不空 | 是 |");
  });

  it("连线类组件写不占格子、按两端组件指向；按格子摆放的写占几格", () => {
    expect(catalog["Arrow.md"]).toContain("不占格子");
    expect(catalog["Arrow.md"]).toContain('"from": "dry", "to": "etc"');
    expect(catalog["Computer.md"]).toContain("## 占几格\n\n4 列 × 4 行。");
  });

  it("状态表标出初始状态，写出切到每个状态的默认音效（不放写「不放」）", () => {
    const page = catalog["Mascot.md"]!;
    expect(page).toContain("| `normal`（初始） | 头顶没东西 | 不放 |");
    expect(page).toContain("| `exclaim` | 头顶冒感叹号 | `ding` |");
  });

  it("动画和音效：默认入场、退场，组件自己的特殊效果", () => {
    const page = catalog["HintSign.md"]!;
    expect(page).toContain("入场默认 `light`，退场默认 `fade`");
    expect(page).toContain("`light`（0.8 秒）");
    expect(page).toContain("入场 `ding`，退场 `leave`");
  });

  it.each(names)("%s 的调用示例通过参数检查", (name) => {
    const declared = COMPONENT_DECLARATIONS[name as keyof typeof COMPONENT_DECLARATIONS];
    expect(declared.props.safeParse(declared.docs!.example.props).success).toBe(true);
  });
});

describe("生成组件目录", () => {
  it("登记的组件没写详情说明时报错，写明是哪个组件", () => {
    const Bare = declareComponent({
      effect: "一个方块",
      suitedFor: "测试",
      props: z.strictObject({}),
      states: ["normal"],
      cells: () => [1, 1],
      enter: "fade",
      sounds: { enter: null, states: { normal: null } },
    });
    expect(() => generateCatalog({ Bare })).toThrow("Bare");
  });
});
