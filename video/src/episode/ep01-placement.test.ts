import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planEpisode } from "./episode-plan";

// ep01 摆放试验（#34）：在动画之前，先看 ch02 ep01 的 17 个画面能不能放进 12×6 网格。
// 合成清单抄自 books/pragmatic-programmer/ch02/ep01/episode.json（gitignore），去掉了音频路径
// 和旧的 TTS 片尾段（#51 去掉了）；
// 分镜是占位摆放，组件需求按 #13 评论里的清单。7 个组件都做完了（小人 #42 是最后一个），
// 现在全部用组件注册表里真实的声明：格数按参数算，标签按字体度量检查，状态按声明核对。
const read = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8"),
  ) as unknown;
const MANIFEST = read("ep01-episode.json");
const PLACEMENT = read("ep01-placement.storyboard.json");

describe("ep01 摆放试验", () => {
  const plan = planEpisode(MANIFEST, PLACEMENT);

  it("17 个画面都摆了组件，越界和重叠检查全部通过", () => {
    const scenes = plan.manifest.scenes.map((scene) => scene.id);
    const placed = new Set(plan.cues.map((cue) => cue.key.split("/")[0]));

    expect(scenes).toHaveLength(17);
    expect(scenes.filter((scene) => !placed.has(scene))).toEqual([]);
  });

  it("箭头（s01-c03 三个方块指向 ETC，s05-c05 代码指向文档和数据库 Schema）拿到两端的格子，其余组件按格子摆放", () => {
    const arrows = plan.cues.filter((cue) => cue.component === "Arrow");
    expect(arrows.map((cue) => cue.key)).toEqual([
      "s01-c03/decouple-etc",
      "s01-c03/single-etc",
      "s01-c03/naming-etc",
      "s05-c05/code-docs",
      "s05-c05/code-schema",
    ]);
    expect(arrows.every((cue) => cue.area === null && cue.ends !== null)).toBe(true);
    expect(
      plan.cues.filter((cue) => cue.component !== "Arrow").every((cue) => cue.area !== null),
    ).toBe(true);
  });

  it("s05-c04 的「复制粘贴源码」先单独出现，再嵌进大方块「知识和意图」的左上角", () => {
    const cue = (id: string) => plan.cues.find((c) => c.key === `s05-c04/${id}`)!;
    const [alone, intent, copy] = [cue("copy-alone"), cue("intent"), cue("copy")];
    // 单独的小块瞬间消失的那一帧，大方块入场，嵌着的小块瞬间出现在同一格
    expect(alone.endFrame).toBe(intent.startFrame);
    expect(copy.startFrame).toBe(intent.startFrame);
    expect(copy.area).toEqual({ at: [4, 1], cells: [2, 1] });
    expect(intent.area).toEqual({ at: [4, 1], cells: [4, 3] });
  });

  it("岔路和时间线用真实声明：s02-c01 标出一条路，s03-c02 放上又撤掉路障，s04-c04 点亮到第 3 个节点", () => {
    const states = (key: string) =>
      plan.cues.find((c) => c.key === key)!.states.map((s) => s.state);
    expect(states("s02-c01/fork")).toEqual(["mark-2"]);
    expect(states("s03-c02/fork")).toEqual(["block-2", "normal"]);
    expect(states("s04-c04/timeline")).toEqual(["lit-3"]);
    expect(plan.cues.find((c) => c.key === "s04-c04/timeline")!.area).toEqual({
      at: [3, 2],
      cells: [6, 2],
    });
  });

  it("小人用真实声明：s01-c01 一群 5 个挤成前后两排，s02-c02 三个并排，头顶一起冒问号", () => {
    const cue = (key: string) => plan.cues.find((c) => c.key === key)!;
    expect(cue("s01-c01/gurus").area).toEqual({ at: [3, 2], cells: [6, 4] });
    expect(cue("s02-c02/coders").area).toEqual({ at: [3, 1], cells: [6, 3] });
    expect(cue("s02-c02/coders").states.map((s) => s.state)).toEqual(["question"]);
  });
});
