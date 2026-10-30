import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPONENT_DECLARATIONS } from "./declarations";

// 组件目录一致性（#44）：README「组件目录」是 `/storyboard` 写分镜的唯一输入，
// 必须列出组件注册表里的每个组件（每个组件一个 `#### 中文名 \`组件名\`` 小节），
// 每个小节里用反引号写出这个组件声明的每个状态名。
const README = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

/** README 里「### 组件目录」这一节：到下一个 `###` 或 `##` 标题为止 */
const catalogSection = (readme: string): string => {
  const start = readme.search(/^### 组件目录$/m);
  if (start < 0) throw new Error("README 里没有「### 组件目录」一节");
  const rest = readme.slice(readme.indexOf("\n", start) + 1);
  const end = rest.search(/^#{2,3} /m);
  return end < 0 ? rest : rest.slice(0, end);
};

/** 组件目录里的小节：标题里反引号中的组件名 → 小节正文 */
const catalogEntries = (section: string): Map<string, string> => {
  const entries = new Map<string, string>();
  const parts = section.split(/^#### /m).slice(1);
  for (const part of parts) {
    const heading = part.slice(0, part.indexOf("\n"));
    const name = heading.match(/`([A-Za-z]+)`/)?.[1];
    if (name) entries.set(name, part);
  }
  return entries;
};

const names = Object.keys(COMPONENT_DECLARATIONS) as (keyof typeof COMPONENT_DECLARATIONS)[];

describe("README 组件目录", () => {
  const entries = catalogEntries(catalogSection(README));

  it("每个登记的组件都有一个小节，没有多出来的组件", () => {
    expect([...entries.keys()].sort()).toEqual([...names].sort());
  });

  it.each(names)("%s 的小节列出了它的每个状态名", (name) => {
    const body = entries.get(name) ?? "";
    const missing = COMPONENT_DECLARATIONS[name].states.filter(
      (state) => !body.includes(`\`${state}\``),
    );
    expect(missing).toEqual([]);
  });
});
