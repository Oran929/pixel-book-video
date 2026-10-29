import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type ComponentDeclarations,
  declareComponent,
} from "../components/declaration";
import { COMPONENT_DECLARATIONS } from "../components/declarations";
import { planEpisode } from "./episode-plan";
import { OUTRO_SEGMENT } from "./manifest";

// ep01 摆放试验（#34）：在动画之前，先看 ch02 ep01 的 17 个画面能不能放进 12×6 网格。
// 合成清单抄自 books/pragmatic-programmer/ch02/ep01/episode.json（gitignore），去掉了音频路径；
// 分镜是占位摆放，组件需求按 #13 评论里的清单；箭头和嵌套（#40）、提示牌和电脑（#41）用组件注册表里真实的声明。知识块用组件注册表里真实的声明（`size` 决定格数，
// 标签按字体度量检查），其余组件还没做，用下面只占格子的占位声明。
const read = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8"),
  ) as unknown;
const MANIFEST = read("ep01-episode.json");
const PLACEMENT = read("ep01-placement.storyboard.json");

const placeholder = (cells: readonly [number, number]) =>
  declareComponent({
    props: z.strictObject({}),
    states: ["normal"],
    cells: () => cells,
    enter: "fade",
    exit: "fade",
    connector: false,
    sounds: { enter: null, exit: null, states: { normal: null } },
  });

// 占位尺寸（列数, 行数），每格 148×124 像素
const PLACEHOLDERS: ComponentDeclarations = {
  PixelBlock: COMPONENT_DECLARATIONS.PixelBlock,
  Arrow: COMPONENT_DECLARATIONS.Arrow,
  // 小人按 1/2 大小：约 205×295 像素 → 2 × 3 格（尺寸由 #42 决定）
  Mascot: placeholder([2, 3]),
  HintSign: COMPONENT_DECLARATIONS.HintSign,
  // 岔路：一个路口加三条路
  Fork: placeholder([6, 4]),
  Computer: COMPONENT_DECLARATIONS.Computer,
  // 时间线：一条横轴加几个节点
  Timeline: placeholder([10, 2]),
};

describe("ep01 摆放试验", () => {
  const plan = planEpisode(MANIFEST, PLACEMENT, PLACEHOLDERS);

  it("17 个画面（片尾除外）都摆了组件，越界和重叠检查全部通过", () => {
    const scenes = plan.manifest.scenes
      .filter((scene) => scene.segment !== OUTRO_SEGMENT)
      .map((scene) => scene.id);
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
});
