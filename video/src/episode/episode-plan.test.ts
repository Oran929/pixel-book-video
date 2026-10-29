import { describe, expect, it } from "vitest";
import { z } from "zod";
import { declareComponent } from "../components/declaration";
import { planEpisode } from "./episode-plan";

const line = (id: string, scene: string, seconds: number) => ({
  id,
  scene,
  text: `字幕 ${id}`,
  audio: `episode/${id}-00000000.wav`,
  seconds,
});

const MANIFEST = {
  voice_fingerprint: "3f2a9c0d1e4b5a6f",
  title: "程序员修炼之道",
  segments: [
    { id: "s01", title: "开场" },
    { id: "s02", title: "原则" },
  ],
  scenes: [
    { id: "s01-c01", segment: "s01", description: "一个方块" },
    { id: "s02-c01", segment: "s02", description: "一个方块" },
  ],
  lines: [
    line("s01-l01", "s01-c01", 2),
    line("s01-l02", "s01-c01", 1.5),
    line("s02-l01", "s02-c01", 2.5),
  ],
};

const STORYBOARD = {
  scenes: [
    {
      scene: "s02-c01",
      components: [
        {
          id: "dry",
          component: "PixelBlock",
          props: { label: "DRY", size: "medium", color: "orange" },
          at: [0, 0],
        },
      ],
      triggers: [
        {
          target: "dry",
          line: "s02-l01",
          offset: 0.5,
          action: "enter",
          animation: "fade",
        },
      ],
    },
  ],
  pauses: [{ after: "s01-l01", seconds: 1.2 }],
};

const lineSpan = (plan: ReturnType<typeof planEpisode>, id: string) => {
  const found = plan.timeline.lines.find((line) => line.id === id);
  if (!found) throw new Error(`时间轴里没有 ${id}`);
  return found;
};

const gapAfterFirstLine = (plan: ReturnType<typeof planEpisode>) =>
  lineSpan(plan, "s01-l02").startFrame - lineSpan(plan, "s01-l01").endFrame;

describe("planEpisode", () => {
  it("applies the storyboard's pauses and schedules its cues on the timeline", () => {
    const plan = planEpisode(MANIFEST, STORYBOARD);

    expect(plan.manifest.title).toBe("程序员修炼之道");
    // 分镜把第一句后的停顿改成 1.2 秒 = 36 帧（30fps）
    expect(gapAfterFirstLine(plan)).toBe(36);
    // 触发在 s02-l01 开始后 0.5 秒 = 15 帧
    expect(plan.cues.map((cue) => cue.startFrame)).toEqual([
      lineSpan(plan, "s02-l01").startFrame + 15,
    ]);
  });

  it("without a storyboard uses the default pauses and has no cues", () => {
    const plan = planEpisode(MANIFEST, null);

    // 默认句间停顿 0.3 秒 = 9 帧
    expect(gapAfterFirstLine(plan)).toBe(9);
    expect(plan.cues).toEqual([]);
  });

  it("rejects a storyboard naming an unknown component", () => {
    const bad = JSON.parse(
      JSON.stringify(STORYBOARD).replace('"PixelBlock"', '"Nope"'),
    ) as unknown;

    expect(() => planEpisode(MANIFEST, bad)).toThrow(/Nope/);
  });
});

// 假的组件声明：只关心状态和默认动画
const DECLARATIONS = {
  Lamp: declareComponent({
    props: z.strictObject({}),
    states: ["off", "on", "broken"],
    cells: () => [1, 1],
    enter: "fade",
    exit: "slide",
    connector: false,
  }),
};

// 30fps、默认停顿：s02-c01 从第 138 帧开始，到第 213 帧（总帧数）结束；
// s02-l01 从第 138 帧开始
type Trigger = Record<string, unknown>;
const lampScene = (...triggers: Trigger[]) => ({
  scenes: [
    {
      scene: "s02-c01",
      components: [{ id: "lamp", component: "Lamp", props: {}, at: [0, 0] }],
      triggers: triggers.map((trigger) => ({
        target: "lamp",
        line: "s02-l01",
        ...trigger,
      })),
    },
  ],
  pauses: [],
});
const plan = (...triggers: Trigger[]) =>
  planEpisode(MANIFEST, lampScene(...triggers), DECLARATIONS);

describe("planEpisode: enter, exit and state", () => {
  it("shows a component from its entrance until its exit animation ends", () => {
    const [cue] = plan(
      { action: "enter", offset: 0 },
      { action: "exit", offset: 1 },
    ).cues;

    // 退场在第 168 帧，默认 slide 0.4 秒 = 12 帧，到第 180 帧
    expect(cue).toMatchObject({
      key: "s02-c01/lamp",
      startFrame: 138,
      endFrame: 180,
      enter: { frame: 138, animation: "fade" },
      exit: { frame: 168, animation: "slide" },
      states: [],
    });
  });

  it("lists the state switches in frame order, between entrance and exit", () => {
    const [cue] = plan(
      { action: "enter", offset: 0 },
      { action: "state", offset: 1.5, state: "broken" },
      { action: "state", offset: 0.5, state: "on" },
      { action: "exit", offset: 2 },
    ).cues;

    expect(cue!.states).toEqual([
      { frame: 153, state: "on" },
      { frame: 183, state: "broken" },
    ]);
    expect(cue!.endFrame).toBe(210);
  });

  const enter = { action: "enter", offset: 0.5 };
  it.each([
    [
      "a state switch before the entrance",
      [enter, { action: "state", offset: 0, state: "on" }],
      /第 1 个画面 第 2 个触发: 切换状态的帧 138 早于组件 lamp 的入场帧 153/,
    ],
    [
      "a state switch on the exit frame",
      [
        enter,
        { action: "exit", offset: 1 },
        { action: "state", offset: 1, state: "on" },
      ],
      /第 1 个画面 第 3 个触发: 切换状态的帧 168 不早于组件 lamp 的退场帧 168/,
    ],
    [
      "an exit on the entrance frame",
      [{ action: "exit", offset: 0.5 }, enter],
      /第 1 个画面 第 1 个触发: 退场帧 153 不晚于组件 lamp 的入场帧 153/,
    ],
    [
      "two state switches on the same frame",
      [
        enter,
        { action: "state", offset: 1, state: "on" },
        { action: "state", offset: 1.01, state: "broken" },
      ],
      /第 1 个画面 第 3 个触发: 组件 lamp 在第 168 帧已经切换过状态（第 2 个触发）/,
    ],
    [
      "switching to the initial state",
      [enter, { action: "state", offset: 1, state: "off" }],
      /第 1 个画面 第 2 个触发: 组件 lamp 这时已经是状态 off/,
    ],
    [
      "switching to the state it just switched to",
      [
        { action: "state", offset: 1.5, state: "on" },
        enter,
        { action: "state", offset: 1, state: "on" },
      ],
      /第 1 个画面 第 1 个触发: 组件 lamp 这时已经是状态 on/,
    ],
    [
      "an exit animation that would be cut off by the scene end",
      // 退场在第 204 帧，slide 12 帧，到第 216 帧，晚于画面结束帧 213
      [enter, { action: "exit", offset: 2.2 }],
      /第 1 个画面 第 2 个触发: 组件 lamp 的退场动画 slide 到第 216 帧才播完，晚于画面 s02-c01 的结束帧 213/,
    ],
    [
      "a state the component does not declare",
      [enter, { action: "state", offset: 1, state: "lit" }],
      /第 1 个画面 第 2 个触发 state: 组件 lamp（Lamp）没有状态 lit，声明过的状态：off、on、broken/,
    ],
    [
      "a state trigger without a state name",
      [enter, { action: "state", offset: 1 }],
      /第 1 个画面 第 2 个触发 state:/,
    ],
    [
      "an unknown action",
      [enter, { action: "move", offset: 1 }],
      /第 1 个画面 第 2 个触发 action:/,
    ],
    [
      "a component that never enters",
      [{ action: "exit", offset: 1 }],
      /第 1 个画面 第 1 个组件: 组件 lamp 没有 enter 触发/,
    ],
    [
      "a component that enters twice",
      [enter, { action: "enter", offset: 1 }],
      /第 1 个画面 第 2 个触发: 组件 lamp 已经有 enter 触发/,
    ],
    [
      "a component that exits twice",
      [enter, { action: "exit", offset: 1 }, { action: "exit", offset: 1.5 }],
      /第 1 个画面 第 3 个触发: 组件 lamp 已经有 exit 触发/,
    ],
    [
      "an exit after the scene ends",
      [enter, { action: "exit", offset: 3 }],
      /第 1 个画面 第 2 个触发: 触发帧 228 不早于画面 s02-c01 的结束帧 213/,
    ],
  ] as [string, Trigger[], RegExp][])("rejects %s and says where", (_, triggers, message) => {
    expect(() => plan(...triggers)).toThrow(message);
  });

  it("lets a trigger's animation replace the component's default", () => {
    const [cue] = plan(
      { action: "enter", offset: 0, animation: "slide" },
      { action: "exit", offset: 1, animation: "fade" },
    ).cues;

    expect(cue!.enter.animation).toBe("slide");
    expect(cue!.exit!.animation).toBe("fade");
  });

  it("with `none` exits instantly, so it may exit on the scene's last frame", () => {
    // 画面结束帧 213（不含），最后一帧是 212 = 138 + 2.5 × 30 − 1
    const [cue] = plan(
      { action: "enter", offset: 0, animation: "none" },
      { action: "exit", offset: 74 / 30, animation: "none" },
    ).cues;

    expect(cue).toMatchObject({
      enter: { frame: 138, animation: "none" },
      exit: { frame: 212, animation: "none" },
      endFrame: 212,
    });
  });

  it("without an exit shows the component until the scene ends", () => {
    const [cue] = plan({ action: "enter", offset: 1 }).cues;

    expect(cue).toMatchObject({ startFrame: 168, endFrame: 213, exit: null });
  });
});

// 假的组件声明：占几格由参数 `w`、`h` 决定
const BOXES = {
  Box: declareComponent({
    props: z.strictObject({ w: z.number().int(), h: z.number().int() }),
    states: ["normal"],
    cells: ({ w, h }) => [w, h],
    enter: "fade",
    exit: "slide",
    connector: false,
  }),
};

type Box = { id: string; at: unknown; w?: number; h?: number };
// 都在 s02-c01（第 138–213 帧）里；`triggers` 的 line 都是 s02-l01
const boxScene = (boxes: Box[], triggers: Trigger[]) => ({
  scenes: [
    {
      scene: "s02-c01",
      components: boxes.map(({ id, at, w = 1, h = 1 }) => ({
        id,
        component: "Box",
        props: { w, h },
        at,
      })),
      triggers: triggers.map((trigger) => ({ line: "s02-l01", ...trigger })),
    },
  ],
  pauses: [],
});
const enterAt = (target: string, offset = 0) => ({
  target,
  action: "enter",
  offset,
});
const exitAt = (target: string, offset: number) => ({
  target,
  action: "exit",
  offset,
});
const planBoxes = (boxes: Box[], triggers: Trigger[]) =>
  planEpisode(MANIFEST, boxScene(boxes, triggers), BOXES);

describe("planEpisode: the 12×6 grid", () => {
  it("puts each component's area on the cue: top-left cell and cells taken", () => {
    const [cue] = planBoxes(
      [{ id: "a", at: [9, 4], w: 3, h: 2 }],
      [enterAt("a")],
    ).cues;

    expect(cue!.area).toEqual({ at: [9, 4], cells: [3, 2] });
  });

  it.each([
    ["past the right edge", [10, 0], 3, 1, /第 1 个画面 第 1 个组件 at: 组件 a 从 \[10, 0\] 起占 3×1 格，超出 12×6 网格的右边/],
    ["past the bottom edge", [0, 5], 1, 2, /第 1 个画面 第 1 个组件 at: 组件 a 从 \[0, 5\] 起占 1×2 格，超出 12×6 网格的下边/],
    ["at a negative cell", [-1, 0], 1, 1, /第 1 个画面 第 1 个组件 at/],
    ["at a fractional cell", [0.5, 0], 1, 1, /第 1 个画面 第 1 个组件 at/],
  ] as [string, unknown, number, number, RegExp][])(
    "rejects a component %s",
    (_, at, w, h, message) => {
      expect(() => planBoxes([{ id: "a", at, w, h }], [enterAt("a")])).toThrow(
        message,
      );
    },
  );

  it("rejects a component placed without `at`", () => {
    const data = boxScene([{ id: "a", at: undefined }], [enterAt("a")]);

    expect(() => planEpisode(MANIFEST, data, BOXES)).toThrow(
      /第 1 个画面 第 1 个组件 at: 组件 a（Box）要写 at/,
    );
  });

  it("accepts a component filling the whole grid", () => {
    expect(() =>
      planBoxes([{ id: "a", at: [0, 0], w: 12, h: 6 }], [enterAt("a")]),
    ).not.toThrow();
  });
});

describe("planEpisode: components on screen together must not overlap", () => {
  it("rejects two components sharing a cell at the same time", () => {
    expect(() =>
      planBoxes(
        [
          { id: "a", at: [0, 0], w: 3, h: 2 },
          { id: "b", at: [2, 1], w: 2, h: 2 },
        ],
        [enterAt("a"), enterAt("b", 1)],
      ),
    ).toThrow(
      /分镜第 1 个画面: 第 2 个组件 b 和第 1 个组件 a 的格子重叠（格 \[2, 1\]），从第 168 帧到第 213 帧（不含）同时在画面上/,
    );
  });

  it("accepts components side by side", () => {
    expect(() =>
      planBoxes(
        [
          { id: "a", at: [0, 0], w: 3, h: 2 },
          { id: "b", at: [3, 0], w: 2, h: 2 },
          { id: "c", at: [0, 2], w: 5, h: 1 },
        ],
        [enterAt("a"), enterAt("b"), enterAt("c")],
      ),
    ).not.toThrow();
  });

  // a 在第 168 帧退场，默认 slide 12 帧，到第 180 帧才离开画面
  const takingOver = (offset: number) =>
    planBoxes(
      [
        { id: "a", at: [0, 0] },
        { id: "b", at: [0, 0] },
      ],
      [enterAt("a"), exitAt("a", 1), enterAt("b", offset)],
    );

  it("lets a component take the cells once the one before has finished exiting", () => {
    const plan = takingOver(42 / 30);

    expect(plan.cues.map((cue) => [cue.startFrame, cue.endFrame])).toEqual([
      [138, 180],
      [180, 213],
    ]);
  });

  it("counts the exit animation: entering while it still plays is an overlap", () => {
    expect(() => takingOver(41 / 30)).toThrow(
      /第 2 个组件 b 和第 1 个组件 a 的格子重叠（格 \[0, 0\]），从第 179 帧到第 180 帧（不含）同时在画面上/,
    );
  });
});

// 知识块（PixelBlock，用组件注册表的声明）：`size` 决定占几格和字号
const blockScene = (props: Record<string, unknown>, triggers: Trigger[] = []) => ({
  scenes: [
    {
      scene: "s02-c01",
      components: [{ id: "k", component: "PixelBlock", props, at: [0, 0] }],
      triggers: [
        { target: "k", line: "s02-l01", offset: 0, action: "enter" },
        ...triggers.map((trigger) => ({ target: "k", line: "s02-l01", ...trigger })),
      ],
    },
  ],
  pauses: [],
});
const planBlock = (props: Record<string, unknown>, triggers: Trigger[] = []) =>
  planEpisode(MANIFEST, blockScene({ color: "orange", ...props }, triggers));

describe("planEpisode: knowledge block size and label", () => {
  it.each([
    ["small", [2, 1]],
    ["medium", [3, 2]],
    ["large", [4, 3]],
  ])("size %s takes %j cells", (size, cells) => {
    const [cue] = planBlock({ label: "知识", size }).cues;
    expect(cue!.area!.cells).toEqual(cells);
  });

  it.each([
    // 汉字按 1 个字号宽：5 × 48 = 240 ≤ 364
    ["知识和意图", "medium"],
    // 拉丁字母按字体度量：3 × 48 + 空格 24 + Schema 156 = 324 ≤ 364
    // （要是也按 1 个字号宽，10 × 48 = 480，就放不下了）
    ["数据库 Schema", "medium"],
    // 9 × 24 = 216，正好放满
    ["一二三四五六七八九", "small"],
  ])("fits the label %s on a %s block", (label, size) => {
    expect(() => planBlock({ label, size })).not.toThrow();
  });

  it.each([
    [
      "一二三四五六七八九十",
      "small",
      /第 1 个画面 第 1 个组件 props label: 标签「一二三四五六七八九十」估算宽 240 像素，size small 最多放 216 像素/,
    ],
    [
      "数据库 Schema",
      "large",
      /标签「数据库 Schema」估算宽 648 像素，size large 最多放 512 像素/,
    ],
  ])("rejects the label %s that does not fit a %s block", (label, size, message) => {
    expect(() => planBlock({ label, size })).toThrow(message);
  });

  it("rejects a block without a size", () => {
    expect(() => planBlock({ label: "知识" })).toThrow(
      /第 1 个画面 第 1 个组件 props size/,
    );
  });
});

describe("planEpisode: knowledge block color and states", () => {
  it.each(["orange", "green", "blue", "purple", "cream", "stone"])(
    "accepts the color %s from the style sheet",
    (color) => {
      expect(() => planBlock({ label: "知识", size: "small", color })).not.toThrow();
    },
  );

  it("rejects a color that is not a block color", () => {
    expect(() =>
      planBlock({ label: "知识", size: "small", color: "#ff0000" }),
    ).toThrow(/第 1 个画面 第 1 个组件 props color/);
  });

  it("rejects a block without a color", () => {
    expect(() =>
      planEpisode(MANIFEST, blockScene({ label: "知识", size: "small" })),
    ).toThrow(/第 1 个画面 第 1 个组件 props color/);
  });

  it("enters as normal, then can be highlighted and marked as changed", () => {
    const [cue] = planBlock({ label: "知识", size: "small" }, [
      { action: "state", offset: 0.5, state: "highlight" },
      { action: "state", offset: 1, state: "changed" },
    ]).cues;

    expect(cue).toMatchObject({
      initialState: "normal",
      states: [
        { frame: 153, state: "highlight" },
        { frame: 168, state: "changed" },
      ],
    });
  });

  it("rejects a state the block does not have", () => {
    expect(() =>
      planBlock({ label: "知识", size: "small" }, [
        { action: "state", offset: 0.5, state: "broken" },
      ]),
    ).toThrow(/没有状态 broken，声明过的状态：normal、highlight、changed/);
  });
});
