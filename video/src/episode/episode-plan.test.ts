import { describe, expect, it } from "vitest";
import { z } from "zod";
import { declareComponent, declareConnector } from "../components/declaration";
import { planEpisode as planWithBookends } from "./episode-plan";
import { withEveryScene } from "./fixtures/every-scene";
import { lineAt, showsResidents } from "./timeline";

// 除了最后的「片头和片尾」一组，这里的测试只看正文：片头片尾都选「不用」，帧数从 0 算起。
// 分镜没写到的画面补一个占位组件（每个画面至少一个组件的检查本身见「every scene」两条）
const planEpisode = (...[manifest, storyboard, components]: Parameters<typeof planWithBookends>) =>
  planWithBookends(manifest, ...withEveryScene(manifest, storyboard, components), {
    intro: null,
    outro: null,
  });

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
    // 组件上的字要出自画面说明（#36）：下面知识块用到的标签都写在这里
    {
      id: "s02-c01",
      segment: "s02",
      description: "知识块 DRY、知识和意图、数据库 Schema、一二三四五六七八九十",
    },
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
      scene: "s01-c01",
      components: [
        {
          id: "block",
          component: "PixelBlock",
          props: { label: "方块", size: "medium", color: "blue" },
          at: [0, 0],
        },
      ],
      triggers: [{ target: "block", line: "s01-l01", offset: 0, action: "enter" }],
    },
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
  music: "forgotten-path",
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
    // 方块在 s01-l01 开始时入场；DRY 在 s02-l01 开始后 0.5 秒 = 15 帧
    expect(plan.cues.map((cue) => cue.startFrame)).toEqual([
      lineSpan(plan, "s01-l01").startFrame,
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

  // 每个画面至少一个组件（spec #16 用户故事 56）。片尾不再是画面（修订三、#51），没有例外
  it("every scene: rejects a scene the storyboard leaves out", () => {
    const withoutFirst = { ...STORYBOARD, scenes: STORYBOARD.scenes.slice(1) };

    expect(() => planWithBookends(MANIFEST, withoutFirst)).toThrow(
      /画面 s01-c01 没有组件/,
    );
  });

  it("every scene: rejects a scene listed with no components", () => {
    const empty = {
      ...STORYBOARD,
      scenes: [{ scene: "s01-c01", components: [], triggers: [] }, ...STORYBOARD.scenes.slice(1)],
    };

    expect(() => planEpisode(MANIFEST, empty)).toThrow(/画面 s01-c01 没有组件/);
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
    sounds: { enter: null, exit: null, states: { off: null, on: null, broken: null } },
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
  music: "forgotten-path",
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
      { frame: 153, state: "on", sound: null },
      { frame: 183, state: "broken", sound: null },
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
    sounds: { enter: null, exit: null, states: { normal: null } },
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
  music: "forgotten-path",
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

    const inScene = plan.cues.filter((cue) => cue.key.startsWith("s02-c01/"));
    expect(inScene.map((cue) => [cue.startFrame, cue.endFrame])).toEqual([
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
  music: "forgotten-path",
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

// 假的组件声明：每个动作、每个状态都有不同的默认音效，便于分辨响的是哪一个
const NOISY = {
  Lamp: declareComponent({
    props: z.strictObject({}),
    states: ["off", "on", "broken"],
    cells: () => [1, 1],
    enter: "fade",
    exit: "slide",
    connector: false,
    sounds: {
      enter: "pop",
      exit: "leave",
      states: { off: "blip", on: "ding", broken: "crash" },
    },
  }),
  Quiet: declareComponent({
    props: z.strictObject({}),
    states: ["normal"],
    cells: () => [1, 1],
    enter: "fade",
    exit: "fade",
    connector: false,
    sounds: { enter: null, exit: null, states: { normal: null } },
  }),
};
const planSounds = (...triggers: Trigger[]) =>
  planEpisode(MANIFEST, lampScene(...triggers), NOISY).sounds;

describe("planEpisode: sound effects", () => {
  it("plays each action's default sound on the trigger frame", () => {
    // s02-l01 从第 138 帧开始：入场 138、切到 on 153、切到 broken 168、退场 183
    expect(
      planSounds(
        { action: "enter", offset: 0 },
        { action: "exit", offset: 1.5 },
        { action: "state", offset: 1, state: "broken" },
        { action: "state", offset: 0.5, state: "on" },
      ),
    ).toEqual([
      { frame: 138, sound: "pop" },
      { frame: 153, sound: "ding" },
      { frame: 168, sound: "crash" },
      { frame: 183, sound: "leave" },
    ]);
  });

  it("does not sound the initial state when the component enters", () => {
    expect(planSounds({ action: "enter", offset: 0 })).toEqual([
      { frame: 138, sound: "pop" },
    ]);
  });

  it("sounds the initial state when switching back to it", () => {
    expect(
      planSounds(
        { action: "enter", offset: 0 },
        { action: "state", offset: 0.5, state: "on" },
        { action: "state", offset: 1, state: "off" },
      ),
    ).toEqual([
      { frame: 138, sound: "pop" },
      { frame: 153, sound: "ding" },
      { frame: 168, sound: "blip" },
    ]);
  });

  it("drops a trigger's sound with `sound: null`", () => {
    expect(
      planSounds(
        { action: "enter", offset: 0, sound: null },
        { action: "state", offset: 0.5, state: "on", sound: null },
        { action: "exit", offset: 1, sound: null },
      ),
    ).toEqual([]);
  });

  it("replaces a trigger's sound with another registered one", () => {
    expect(
      planSounds(
        { action: "enter", offset: 0, sound: "drop" },
        { action: "state", offset: 0.5, state: "on", sound: "buzz" },
        { action: "exit", offset: 1, sound: "pop" },
      ),
    ).toEqual([
      { frame: 138, sound: "drop" },
      { frame: 153, sound: "buzz" },
      { frame: 168, sound: "pop" },
    ]);
  });

  it("rejects an unregistered sound and says where", () => {
    expect(() =>
      planSounds(
        { action: "enter", offset: 0 },
        { action: "state", offset: 0.5, state: "on", sound: "boom" },
      ),
    ).toThrow(/第 1 个画面 第 2 个触发 sound: 音效 boom 没有登记，登记过的音效：drop、pop/);
  });

  it("plays no sound for a `none` entrance or exit", () => {
    expect(
      planSounds(
        { action: "enter", offset: 0, animation: "none" },
        { action: "exit", offset: 1, animation: "none" },
      ),
    ).toEqual([]);
  });

  it("rejects a sound written on a `none` entrance or exit", () => {
    expect(() =>
      planSounds(
        { action: "enter", offset: 0 },
        { action: "exit", offset: 1, animation: "none", sound: "leave" },
      ),
    ).toThrow(/第 1 个画面 第 2 个触发: 动画 none 不放音效，去掉 sound/);
  });

  it("plays nothing for a component that declares no sounds", () => {
    const storyboard = {
      scenes: [
        {
          scene: "s02-c01",
          components: [{ id: "q", component: "Quiet", props: {}, at: [0, 0] }],
          triggers: [
            { target: "q", line: "s02-l01", offset: 0, action: "enter" },
            { target: "q", line: "s02-l01", offset: 1, action: "exit" },
          ],
        },
      ],
      music: "forgotten-path",
      pauses: [],
    };
    expect(planEpisode(MANIFEST, storyboard, NOISY).sounds).toEqual([]);
  });

  it("lists the sounds of every scene and component in frame order", () => {
    const storyboard = {
      scenes: [
        {
          scene: "s02-c01",
          components: [
            { id: "late", component: "Lamp", props: {}, at: [0, 0] },
            { id: "early", component: "Lamp", props: {}, at: [1, 0] },
          ],
          triggers: [
            { target: "late", line: "s02-l01", offset: 1, action: "enter" },
            { target: "early", line: "s02-l01", offset: 0, action: "enter" },
          ],
        },
        {
          scene: "s01-c01",
          components: [{ id: "first", component: "Lamp", props: {}, at: [0, 0] }],
          triggers: [
            { target: "first", line: "s01-l01", offset: 0, action: "enter" },
          ],
        },
      ],
      music: "forgotten-path",
      pauses: [],
    };
    expect(planEpisode(MANIFEST, storyboard, NOISY).sounds).toEqual([
      { frame: 0, sound: "pop" },
      { frame: 138, sound: "pop" },
      { frame: 168, sound: "pop" },
    ]);
  });

  it("plays a sound once when several components make it on the same frame", () => {
    // 像 ep01 s01-c03 那样三个方块同时入场：同一帧的同一个音效只放一次，叠起来不会更响；
    // 同一帧的不同音效照样都放
    const storyboard = {
      scenes: [
        {
          scene: "s02-c01",
          components: ["a", "b", "c"].map((id, i) => ({
            id,
            component: "Lamp",
            props: {},
            at: [i, 0],
          })),
          triggers: [
            { target: "a", line: "s02-l01", offset: 0, action: "enter" },
            { target: "b", line: "s02-l01", offset: 0, action: "enter" },
            { target: "c", line: "s02-l01", offset: 0, action: "enter", sound: "drop" },
          ],
        },
      ],
      music: "forgotten-path",
      pauses: [],
    };
    expect(planEpisode(MANIFEST, storyboard, NOISY).sounds).toEqual([
      { frame: 138, sound: "pop" },
      { frame: 138, sound: "drop" },
    ]);
  });

  it("without a storyboard plays no sounds", () => {
    expect(planEpisode(MANIFEST, null).sounds).toEqual([]);
  });
});

describe("planEpisode: music", () => {
  // MANIFEST 用默认停顿共 213 帧（30fps）
  const scored = (music: unknown) => ({ ...lampScene({ action: "enter", offset: 0 }), music });

  it("plays the storyboard's track and fades it out over the last 2 seconds", () => {
    expect(planEpisode(MANIFEST, scored("forgotten-path"), DECLARATIONS).music).toEqual({
      track: "forgotten-path",
      startFrame: 0,
      endFrame: 213,
      fadeFrom: 153,
    });
  });

  it("rejects a track that is not in the music library and lists the registered ones", () => {
    expect(() => planEpisode(MANIFEST, scored("nope"), DECLARATIONS)).toThrow(
      /music: 配乐 nope 没有登记，登记过的配乐：.*forgotten-path/,
    );
  });

  it("rejects a storyboard without music", () => {
    const silent: Record<string, unknown> = scored("forgotten-path");
    delete silent.music;
    expect(() => planEpisode(MANIFEST, silent, DECLARATIONS)).toThrow(
      /music: 有分镜时要写 music：配乐登记表里的曲子 ID/,
    );
  });

  it("fades from the first frame when the episode is shorter than 2 seconds", () => {
    // 只有一句 1.5 秒 = 45 帧，不到淡出的 60 帧
    const short = {
      ...MANIFEST,
      segments: [MANIFEST.segments[1]],
      scenes: [MANIFEST.scenes[1]],
      lines: [line("s02-l01", "s02-c01", 1.5)],
    };
    const plan = planEpisode(short, scored("forgotten-path"), DECLARATIONS);
    expect(plan.timeline.totalFrames).toBe(45);
    expect(plan.music?.fadeFrom).toBe(0);
  });

  it("plays no music without a storyboard (subtitles only)", () => {
    expect(planEpisode(MANIFEST, null).music).toBeNull();
  });
});

// 假的组件声明：Box 按格子摆放，Link 是连线类组件（箭头），按 `from`、`to` 指向两端
const LINKED = {
  ...BOXES,
  Link: declareConnector({
    props: z.strictObject({}),
    states: ["normal"],
    enter: "fade",
    exit: "fade",
    sounds: { enter: null, exit: null, states: { normal: null } },
  }),
};
type Used = Record<string, unknown> & { id: string };
const box = (id: string, at: [number, number], extra: Record<string, unknown> = {}): Used => ({
  id,
  component: "Box",
  props: { w: 2, h: 1 },
  at,
  ...extra,
});
const link = (id: string, from: unknown, to: unknown): Used => ({
  id,
  component: "Link",
  props: {},
  from,
  to,
});
// 都在 s02-c01（第 138–213 帧）里；`triggers` 的 line 都是 s02-l01
const planLinked = (components: Used[], triggers: Trigger[]) =>
  planEpisode(
    MANIFEST,
    {
      scenes: [
        {
          scene: "s02-c01",
          components,
          triggers: triggers.map((trigger) => ({ line: "s02-l01", ...trigger })),
        },
      ],
      music: "forgotten-path",
      pauses: [],
    },
    LINKED,
  );
const AB = [box("a", [0, 0]), box("b", [6, 2])];

describe("planEpisode: arrows point from one component to another", () => {
  it("rejects an end that is not a component in this scene", () => {
    expect(() =>
      planLinked(
        [...AB, link("ab", "a", "nope")],
        [enterAt("a"), enterAt("b"), enterAt("ab")],
      ),
    ).toThrow(/第 1 个画面 第 3 个组件 to: 组件 ab（Link）指向的 nope 不是本画面的组件/);
  });

  it("rejects an arrow that enters before one of its ends", () => {
    // b 在第 168 帧入场，箭头在第 153 帧
    expect(() =>
      planLinked(
        [...AB, link("ab", "a", "b")],
        [enterAt("a"), enterAt("b", 1), enterAt("ab", 0.5)],
      ),
    ).toThrow(
      /分镜第 1 个画面 第 3 个组件 ab: 箭头从第 153 帧到第 213 帧（不含）在画面上，超出终点 b 的第 168 帧到第 213 帧/,
    );
  });

  it("rejects an arrow still on screen after one of its ends has exited", () => {
    // a 在第 168 帧退场，默认 slide 12 帧，第 180 帧离开画面；箭头没有退场，显示到第 213 帧
    expect(() =>
      planLinked(
        [...AB, link("ab", "a", "b")],
        [enterAt("a"), enterAt("b"), exitAt("a", 1), enterAt("ab", 0.5)],
      ),
    ).toThrow(
      /分镜第 1 个画面 第 3 个组件 ab: 箭头从第 153 帧到第 213 帧（不含）在画面上，超出起点 a 的第 138 帧到第 180 帧（不含）/,
    );
  });

  it("accepts an arrow entering on the same frame as its ends, and gives it both ends' cells", () => {
    const plan = planLinked(
      [...AB, link("ab", "a", "b")],
      [enterAt("a"), enterAt("b"), enterAt("ab")],
    );
    const arrow = plan.cues.find((cue) => cue.key === "s02-c01/ab")!;

    expect(arrow).toMatchObject({
      startFrame: 138,
      area: null,
      ends: {
        from: { at: [0, 0], cells: [2, 1] },
        to: { at: [6, 2], cells: [2, 1] },
      },
    });
  });

  it("accepts an arrow that exits together with its ends", () => {
    expect(() =>
      planLinked(
        [...AB, link("ab", "a", "b")],
        [enterAt("a"), enterAt("b"), enterAt("ab"), exitAt("a", 1), exitAt("b", 1), exitAt("ab", 1)],
      ),
    ).not.toThrow();
  });

  it.each([
    ["placed with `at`", { ...link("ab", "a", "b"), at: [0, 0] }, /第 3 个组件 at: 组件 ab（Link）是连线类组件，不写 at/],
    ["without `from`", link("ab", undefined, "b"), /第 3 个组件 from: 组件 ab（Link）是连线类组件，要写 from/],
    ["pointing from and to the same component", link("ab", "a", "a"), /第 3 个组件 to: 组件 ab（Link）的 from 和 to 都是 a/],
    ["with a parent", { ...link("ab", "a", "b"), parent: "a" }, /第 3 个组件 parent: 组件 ab（Link）是连线类组件，不写 parent/],
  ] as [string, Used, RegExp][])("rejects an arrow %s", (_, arrow, message) => {
    expect(() =>
      planLinked([...AB, arrow], [enterAt("a"), enterAt("b"), enterAt("ab")]),
    ).toThrow(message);
  });

  it("rejects an arrow pointing at another arrow", () => {
    expect(() =>
      planLinked(
        [...AB, link("ab", "a", "b"), link("x", "a", "ab")],
        [enterAt("a"), enterAt("b"), enterAt("ab"), enterAt("x")],
      ),
    ).toThrow(/第 4 个组件 to: 组件 x（Link）指向的 ab 是连线类组件/);
  });

  it("rejects `from` and `to` on a component that is not a connector", () => {
    expect(() =>
      planLinked(
        [box("a", [0, 0]), box("b", [6, 2], { to: "a" })],
        [enterAt("a"), enterAt("b")],
      ),
    ).toThrow(/第 2 个组件 to: 组件 b（Box）不是连线类组件，不写 to/);
  });
});

// 大方块 big 占 [2, 1] 起的 4×3 格；small 是它的子组件
const big = (extra: Record<string, unknown> = {}) =>
  box("big", [2, 1], { props: { w: 4, h: 3 }, ...extra });
const nested = (at: [number, number], extra: Record<string, unknown> = {}) =>
  box("small", at, { parent: "big", ...extra });

describe("planEpisode: a component nested in a corner of its parent", () => {
  it("does not count a child inside its parent's cells as an overlap", () => {
    expect(() =>
      planLinked([big(), nested([2, 1])], [enterAt("big"), enterAt("small")]),
    ).not.toThrow();
  });

  it("rejects a child whose cells go past its parent's", () => {
    // big 占第 2–5 列；small 从第 5 列起占 2 列，到第 6 列
    expect(() =>
      planLinked([big(), nested([5, 1])], [enterAt("big"), enterAt("small")]),
    ).toThrow(
      /分镜第 1 个画面 第 2 个组件 small: 占从 \[5, 1\] 起的 2×1 格，超出父组件 big从 \[2, 1\] 起的 4×3 格/,
    );
  });

  it("rejects a child that enters before its parent", () => {
    expect(() =>
      planLinked([big(), nested([2, 1])], [enterAt("big", 1), enterAt("small", 0.5)]),
    ).toThrow(
      /分镜第 1 个画面 第 2 个组件 small: 从第 153 帧到第 213 帧（不含）在画面上，超出父组件 big的第 168 帧到第 213 帧（不含）/,
    );
  });

  it("rejects a child still on screen after its parent has exited", () => {
    expect(() =>
      planLinked([big(), nested([2, 1])], [enterAt("big"), enterAt("small"), exitAt("big", 1)]),
    ).toThrow(/第 2 个组件 small: 从第 138 帧到第 213 帧（不含）在画面上，超出父组件 big的第 138 帧到第 180 帧（不含）/);
  });

  it("accepts a child entering with its parent and exiting before it", () => {
    expect(() =>
      planLinked(
        [big(), nested([2, 1])],
        [enterAt("big"), enterAt("small"), exitAt("small", 1)],
      ),
    ).not.toThrow();
  });

  it("still rejects a child overlapping another component that is not its parent", () => {
    expect(() =>
      planLinked(
        [big(), nested([2, 1]), box("other", [0, 0], { props: { w: 3, h: 2 } })],
        [enterAt("big", 1), enterAt("small", 1), enterAt("other")],
      ),
    ).toThrow(/第 2 个组件 small 和第 3 个组件 other 的格子重叠|第 3 个组件 other 和第 1 个组件 big 的格子重叠/);
  });

  it.each([
    ["is not in this scene", [big(), box("small", [2, 1], { parent: "nope" })], /第 2 个组件 parent: 组件 small（Box）的父组件 nope 不是本画面的组件/],
    ["is written after the child (it would be drawn over it)", [nested([2, 1]), big()], /第 1 个组件 parent: 组件 small（Box）要写在父组件 big 后面（后写的画在上面）/],
    ["is the child itself", [big(), box("small", [2, 1], { parent: "small" })], /第 2 个组件 parent: 组件 small（Box）不能是自己的父组件/],
  ] as [string, Used[], RegExp][])("rejects a parent that %s", (_, components, message) => {
    expect(() =>
      planLinked(components, [enterAt("big"), enterAt("small")]),
    ).toThrow(message);
  });

  it("rejects a child covering its parent's label", () => {
    // 大号知识块的标签在中间一行：[4, 1] 起的 4×3 格，标签占 [4, 2] 起的 4×1 格
    const plan = () =>
      planEpisode(
        MANIFEST,
        {
          scenes: [
            {
              scene: "s02-c01",
              components: [
                { id: "intent", component: "PixelBlock", props: { label: "知识和意图", size: "large", color: "orange" }, at: [4, 1] },
                { id: "dry", component: "PixelBlock", props: { label: "DRY", size: "small", color: "blue" }, at: [4, 2], parent: "intent" },
              ],
              triggers: ["intent", "dry"].map((target) => ({ target, line: "s02-l01", offset: 0, action: "enter" })),
            },
          ],
          music: "forgotten-path",
          pauses: [],
        },
      );
    expect(plan).toThrow(
      /第 2 个组件 dry: 压住了父组件 intent的标签（标签占从 \[4, 2\] 起的 4×1 格），换到父组件标签以外的格子/,
    );
  });
});

// 假的组件声明：Glow 有自己的特殊效果 flicker（1 秒 = 30 帧），默认入场用它
const EFFECTS = {
  ...DECLARATIONS,
  Glow: declareComponent({
    props: z.strictObject({}),
    states: ["normal"],
    cells: () => [1, 1],
    effects: { flicker: 1 },
    enter: "flicker",
    exit: "fade",
    connector: false,
    sounds: { enter: "ding", exit: null, states: { normal: null } },
  }),
};
const planGlow = (component: string, ...triggers: Trigger[]) =>
  planEpisode(
    MANIFEST,
    {
      scenes: [
        {
          scene: "s02-c01",
          components: [{ id: "glow", component, props: {}, at: [0, 0] }],
          triggers: triggers.map((trigger) => ({
            target: "glow",
            line: "s02-l01",
            ...trigger,
          })),
        },
      ],
      music: "forgotten-path",
      pauses: [],
    },
    EFFECTS,
  );

describe("planEpisode: a component's own enter and exit effects", () => {
  it("enters with the component's own effect by default, sounding its enter sound", () => {
    const [cue] = planGlow("Glow", { action: "enter", offset: 0 }).cues;

    expect(cue!.enter).toEqual({ frame: 138, animation: "flicker", frames: 30, sound: "ding" });
  });

  it("times an exit with the effect by the effect's own length", () => {
    // 退场在第 168 帧，flicker 30 帧，到第 198 帧
    const [cue] = planGlow(
      "Glow",
      { action: "enter", offset: 0, animation: "fade" },
      { action: "exit", offset: 1, animation: "flicker" },
    ).cues;

    expect(cue).toMatchObject({
      enter: { animation: "fade", frames: 12 },
      exit: { frame: 168, animation: "flicker", frames: 30 },
      endFrame: 198,
    });
  });

  it("rejects an effect exit that would be cut off by the scene end", () => {
    // 退场在第 192 帧，flicker 到第 222 帧，晚于画面结束帧 213
    expect(() =>
      planGlow(
        "Glow",
        { action: "enter", offset: 0 },
        { action: "exit", offset: 1.8, animation: "flicker" },
      ),
    ).toThrow(/组件 glow 的退场动画 flicker 到第 222 帧才播完，晚于画面 s02-c01 的结束帧 213/);
  });

  it("rejects another component's effect and lists the animations this one has", () => {
    expect(() =>
      planGlow("Lamp", { action: "enter", offset: 0, animation: "flicker" }),
    ).toThrow(
      /第 1 个画面 第 1 个触发 animation: 组件 glow（Lamp）没有动画 flicker，可用的动画：fade、slide、none/,
    );
  });

  it("lists the component's own effects among the animations it accepts", () => {
    expect(() =>
      planGlow("Glow", { action: "enter", offset: 0, animation: "spin" }),
    ).toThrow(/没有动画 spin，可用的动画：fade、slide、none、flicker/);
  });
});

// 提示牌和电脑（#41）用组件注册表里真实的声明；画面说明抄自 ep01
const EP01_LIKE = {
  ...MANIFEST,
  scenes: [
    { id: "s01-c01", segment: "s01", description: "提示14 的标题牌亮起，旁边写着 ETC" },
    {
      id: "s02-c01",
      segment: "s02",
      description: "柯克船长对着电脑说出两条自相矛盾的知识，电脑崩溃",
    },
  ],
};
// s01-c01 从第 0 帧开始，到第 138 帧结束；s01-l01 从第 0 帧开始
const planOne = (
  scene: "s01-c01" | "s02-c01",
  used: Record<string, unknown>,
  triggers: Trigger[],
) =>
  planEpisode(EP01_LIKE, {
    scenes: [
      {
        scene,
        components: [{ id: "it", at: [1, 1], ...used }],
        triggers: triggers.map((trigger) => ({
          target: "it",
          line: scene === "s01-c01" ? "s01-l01" : "s02-l01",
          ...trigger,
        })),
      },
    ],
    music: "forgotten-path",
    pauses: [],
  });
const hint = (props: Record<string, unknown>, triggers: Trigger[] = []) =>
  planOne(
    "s01-c01",
    { component: "HintSign", props: { label: "提示", number: "14", title: "ETC", ...props } },
    [{ action: "enter", offset: 0 }, ...triggers],
  );

describe("planEpisode: the hint sign", () => {
  it("takes 5×3 cells and lights up as it enters, with a ding", () => {
    const [cue] = hint({}).cues;

    // 亮起 0.8 秒 = 24 帧
    expect(cue).toMatchObject({
      area: { at: [1, 1], cells: [5, 3] },
      enter: { frame: 0, animation: "light", frames: 24, sound: "ding" },
    });
  });

  it("can still enter with a generic animation instead of lighting up", () => {
    expect(() =>
      planOne(
        "s01-c01",
        { component: "HintSign", props: { label: "提示", number: "14", title: "ETC" } },
        [{ action: "enter", offset: 0, animation: "slide" }],
      ),
    ).not.toThrow();
  });

  it("goes dark with the same effect when it exits with `light`", () => {
    // 退场在第 30 帧，亮起倒着播 24 帧，到第 54 帧
    const [cue] = hint({}, [{ action: "exit", offset: 1, animation: "light" }]).cues;
    expect(cue).toMatchObject({ exit: { frame: 30, animation: "light" }, endFrame: 54 });
  });

  it.each([
    [{ label: "Tip" }, /props label: .*「Tip」/],
    [{ number: "15" }, /props number: .*「15」/],
    [{ title: "DRY" }, /props title: .*「DRY」/],
  ])("rejects display text %j that is not in the scene", (props, message) => {
    expect(() => hint(props)).toThrow(message);
  });

  it("rejects a title too wide for the sign", () => {
    expect(() => hint({ title: "提示14 的标题牌亮起" })).toThrow(
      /props title: 标题「提示14 的标题牌亮起」估算宽 \d+ 像素，提示牌最多放 \d+ 像素/,
    );
  });

  it("rejects an empty number", () => {
    expect(() => hint({ number: "" })).toThrow(/props number/);
  });
});

const computer = (props: Record<string, unknown>, triggers: Trigger[] = []) =>
  planOne(
    "s02-c01",
    { component: "Computer", props: { screen: ["知识"], ...props } },
    [{ action: "enter", offset: 0 }, ...triggers],
  );

describe("planEpisode: the computer", () => {
  it("takes 4×4 cells, enters as normal and crashes with a crash sound", () => {
    // s02-c01 从第 138 帧开始
    const [cue] = computer({}, [{ action: "state", offset: 1, state: "crashed" }]).cues;

    expect(cue).toMatchObject({
      area: { at: [1, 1], cells: [4, 4] },
      initialState: "normal",
      enter: { frame: 138, sound: "pop" },
      states: [{ frame: 168, state: "crashed", sound: "crash" }],
    });
  });

  it("can be switched back to normal after crashing", () => {
    const [cue] = computer({}, [
      { action: "state", offset: 0.5, state: "crashed" },
      { action: "state", offset: 1.5, state: "normal" },
    ]).cues;

    expect(cue!.states.map((s) => s.state)).toEqual(["crashed", "normal"]);
  });

  it("rejects a state the computer does not declare, and says where", () => {
    expect(() => computer({}, [{ action: "state", offset: 1, state: "broken" }])).toThrow(
      /第 1 个画面 第 2 个触发 state: 组件 it（Computer）没有状态 broken，声明过的状态：normal、crashed/,
    );
  });

  it("shows up to three lines on its screen, or none", () => {
    expect(() => computer({ screen: [] })).not.toThrow();
    expect(() => computer({ screen: ["两条", "矛盾的知识", "电脑崩溃"] })).not.toThrow();
    expect(() => computer({ screen: ["知识", "知识", "知识", "知识"] })).toThrow(
      /props screen/,
    );
  });

  it("rejects screen text that is not in the scene, naming the line", () => {
    expect(() => computer({ screen: ["知识", "ERROR"] })).toThrow(/props screen \[1\]: .*「ERROR」/);
  });

  it("rejects a screen line too wide for the screen", () => {
    expect(() => computer({ screen: ["柯克船长对着电脑说出两条"] })).toThrow(
      /props screen \[0\]: 屏幕上的「柯克船长对着电脑说出两条」估算宽 \d+ 像素，屏幕最多放 \d+ 像素/,
    );
  });
});

// 岔路和时间线（#43）：s01-c01 是分岔口，s02-c01 是时间线；组件上的字都写在画面说明里
const EP01_ROADS = {
  ...MANIFEST,
  scenes: [
    {
      id: "s01-c01",
      segment: "s01",
      description: "一个写着 ETC 的向导站在几条路线的分岔口：好改、难改、看不出",
    },
    {
      id: "s02-c01",
      segment: "s02",
      description: "一条开发过程的时间线：起点、需求、编码、发布、维护",
    },
  ],
};
const planIn = (
  scene: "s01-c01" | "s02-c01",
  used: Record<string, unknown>,
  triggers: Trigger[],
) =>
  planEpisode(EP01_ROADS, {
    scenes: [
      {
        scene,
        components: [{ id: "it", at: [1, 1], ...used }],
        triggers: [{ action: "enter", offset: 0 }, ...triggers].map((trigger) => ({
          target: "it",
          line: scene === "s01-c01" ? "s01-l01" : "s02-l01",
          ...trigger,
        })),
      },
    ],
    music: "forgotten-path",
    pauses: [],
  });
const fork = (props: Record<string, unknown>, triggers: Trigger[] = []) =>
  planIn("s01-c01", { component: "Fork", props: { roads: 3, ...props } }, triggers);

describe("planEpisode: the fork in the road", () => {
  it("takes 6×4 cells and can block a road and clear it again, with sounds", () => {
    const [cue] = fork({}, [
      { action: "state", offset: 1, state: "block-2" },
      { action: "state", offset: 2, state: "normal" },
    ]).cues;

    expect(cue).toMatchObject({
      area: { at: [1, 1], cells: [6, 4] },
      initialState: "normal",
      enter: { frame: 0, sound: "pop" },
      states: [
        { frame: 30, state: "block-2", sound: "drop" },
        { frame: 60, state: "normal", sound: "blip" },
      ],
    });
  });

  it("can mark a road, with a blip", () => {
    const [cue] = fork({}, [{ action: "state", offset: 1, state: "mark-3" }]).cues;
    expect(cue!.states).toEqual([{ frame: 30, state: "mark-3", sound: "blip" }]);
  });

  it.each([
    [2, "block-3"],
    [3, "mark-4"],
  ])("rejects a road past the %i roads it has (%s), listing the states it can use", (roads, state) => {
    expect(() => fork({ roads }, [{ action: "state", offset: 1, state }])).toThrow(
      new RegExp(
        `第 1 个画面 第 2 个触发 state: 组件 it（Fork）按它的参数不能用状态 ${state}，能用的状态：normal、mark-1、`,
      ),
    );
  });

  it("rejects a state the fork does not declare at all", () => {
    expect(() => fork({ roads: 4 }, [{ action: "state", offset: 1, state: "block-5" }])).toThrow(
      /组件 it（Fork）没有状态 block-5，声明过的状态：normal、mark-1/,
    );
  });

  it("labels each road with display text from the scene", () => {
    expect(() => fork({ labels: ["好改", "难改", "看不出"] })).not.toThrow();
    expect(() => fork({ labels: ["好改", "难改", "最快"] })).toThrow(/props labels \[2\]: .*「最快」/);
  });

  it("needs one label per road", () => {
    expect(() => fork({ labels: ["好改", "难改"] })).toThrow(
      /props labels: labels 有 2 项，要和 roads（3 条路）一样多/,
    );
  });

  it("rejects a road label too wide for the road", () => {
    expect(() =>
      fork({ roads: 2, labels: ["一个写着 ETC 的向导站在几条路线的分岔口", "好改"] }),
    ).toThrow(/props labels \[0\]: 路上的标签「.*」估算宽 \d+ 像素，最多放 \d+ 像素/);
  });

  it.each([1, 5])("rejects %i roads", (roads) => {
    expect(() => fork({ roads })).toThrow(/props roads/);
  });
});

const timeline = (nodes: string[], triggers: Trigger[] = []) =>
  planIn("s02-c01", { component: "Timeline", props: { nodes } }, triggers);

describe("planEpisode: the timeline", () => {
  it("takes two columns per node and two rows, lighting nodes one by one with a ding", () => {
    // s02-c01 从第 138 帧开始
    const [cue] = timeline(["起点", "编码", "发布", "维护"], [
      { action: "state", offset: 0.5, state: "lit-1" },
      { action: "state", offset: 1, state: "lit-4" },
      { action: "state", offset: 1.5, state: "normal" },
    ]).cues;

    expect(cue).toMatchObject({
      area: { at: [1, 1], cells: [8, 2] },
      initialState: "normal",
      enter: { frame: 138, sound: "pop" },
      states: [
        { frame: 153, state: "lit-1", sound: "ding" },
        { frame: 168, state: "lit-4", sound: "ding" },
        { frame: 183, state: "normal", sound: null },
      ],
    });
  });

  it("rejects lighting up past its last node", () => {
    expect(() => timeline(["起点", "发布"], [{ action: "state", offset: 1, state: "lit-3" }])).toThrow(
      /组件 it（Timeline）按它的参数不能用状态 lit-3，能用的状态：normal、lit-1、lit-2$/m,
    );
  });

  it("rejects node text that is not in the scene", () => {
    expect(() => timeline(["起点", "上线"])).toThrow(/props nodes \[1\]: .*「上线」/);
  });

  it.each([
    [["起点"], "only one node"],
    [["起点", "需求", "编码", "发布", "维护", "起点", "需求"], "seven nodes"],
  ])("rejects %j (%s)", (nodes) => {
    expect(() => timeline(nodes)).toThrow(/props nodes/);
  });

  it("rejects a node label too wide for its two columns", () => {
    expect(() => timeline(["起点", "一条开发过程的时间线"])).toThrow(
      /props nodes \[1\]: 节点「一条开发过程的时间线」估算宽 \d+ 像素/,
    );
  });

  it("keeps a nested child off the node labels", () => {
    expect(() =>
      planEpisode(EP01_ROADS, {
        scenes: [
          {
            scene: "s02-c01",
            components: [
              { id: "line", component: "Timeline", props: { nodes: ["起点", "发布"] }, at: [0, 2] },
              {
                id: "tag",
                component: "PixelBlock",
                props: { label: "维护", size: "small", color: "orange" },
                at: [2, 3],
                parent: "line",
              },
            ],
            triggers: ["line", "tag"].map((target) => ({
              target,
              line: "s02-l01",
              offset: 0,
              action: "enter",
            })),
          },
        ],
        music: "forgotten-path",
        pauses: [],
      }),
    ).toThrow(/压住了.*的标签/);
  });
});

// 小人（#42）：用户选了 1/2 最近邻缩小（A），一个小人占 2×3 格；头顶冒符号是状态，可以排成一群
const mascot = (props: Record<string, unknown>, triggers: Trigger[] = [], at = [1, 1]) =>
  planEpisode(EP01_ROADS, {
    scenes: [
      {
        scene: "s01-c01",
        components: [{ id: "it", component: "Mascot", props, at }],
        triggers: [{ action: "enter", offset: 0 }, ...triggers].map((trigger) => ({
          target: "it",
          line: "s01-l01",
          ...trigger,
        })),
      },
    ],
    music: "forgotten-path",
    pauses: [],
  });

describe("planEpisode: the mascot", () => {
  it("shown at half size, one mascot takes 2×3 cells and pops in", () => {
    const [cue] = mascot({ character: "reader" }).cues;
    expect(cue).toMatchObject({
      area: { at: [1, 1], cells: [2, 3] },
      initialState: "normal",
      enter: { frame: 0, sound: "pop" },
    });
  });

  it("pops a question mark or an exclamation mark over its head as a state, with a sound", () => {
    const [cue] = mascot({ character: "reader" }, [
      { action: "state", offset: 0.5, state: "question" },
      { action: "state", offset: 1, state: "exclaim" },
      { action: "state", offset: 1.5, state: "normal" },
    ]).cues;
    expect(cue!.states).toEqual([
      { frame: 15, state: "question", sound: "blip" },
      { frame: 30, state: "exclaim", sound: "ding" },
      { frame: 45, state: "normal", sound: null },
    ]);
  });

  it("rejects a symbol it does not declare, listing the ones it has", () => {
    expect(() =>
      mascot({ character: "reader" }, [{ action: "state", offset: 1, state: "heart" }]),
    ).toThrow(/组件 it（Mascot）没有状态 heart，声明过的状态：normal、question、exclaim/);
  });

  it.each([
    // 一排：每人两列
    [{ count: 3 }, [6, 3]],
    [{ count: 3, formation: "row" }, [6, 3]],
    // 一排 6 个正好占满网格的宽
    [{ count: 6 }, [12, 3]],
    // 一群：每人隔一列，后排高一行
    [{ count: 5, formation: "crowd" }, [6, 4]],
    // 一个人的一群就是一个小人
    [{ count: 1, formation: "crowd" }, [2, 3]],
  ])("a group %j takes %j cells", (group, cells) => {
    const [cue] = mascot({ character: "reader", ...group }, [], [0, 0]).cues;
    expect(cue!.area).toEqual({ at: [0, 0], cells });
  });

  it("gives each mascot in a group its own character, repeating the list when it runs out", () => {
    expect(() =>
      mascot({ character: ["dragon", "whale", "gothic"], count: 5, formation: "crowd" }),
    ).not.toThrow();
  });

  it.each([
    [{ count: 7 }, [0, 0], /从 \[0, 0\] 起占 14×3 格，超出 12×6 网格的右边/],
    [{ count: 3 }, [7, 0], /从 \[7, 0\] 起占 6×3 格，超出 12×6 网格的右边/],
    [{ count: 2, formation: "crowd" }, [0, 3], /从 \[0, 3\] 起占 3×4 格，超出 12×6 网格的下边/],
  ])("rejects a group %j at %j that goes past the grid", (group, at, message) => {
    expect(() => mascot({ character: "reader", ...group }, [], at)).toThrow(message);
  });

  it.each([
    [{ count: 0 }, /props count/],
    [{ count: 1.5 }, /props count/],
    [{ formation: "circle" }, /props formation/],
    [{ character: [] }, /props character/],
    [{ character: "robot" }, /props character/],
  ])("rejects %j", (bad, message) => {
    expect(() => mascot({ character: "reader", ...bad })).toThrow(message);
  });
});

// 片头和片尾（#50、#51，spec #16 修订二、修订三）：项目配置选的片头（load-pixel-book，422 帧）
// 放在最前面，正文、组件、音效整体后移；选的片尾（bye-bye，324 帧）接在正文最后一句之后。
// 配乐从片头结束放到正文结束，在正文最后 2 秒淡出，不覆盖片头和片尾。
// 下面的期望值按「都不用时」的帧数（上面各条测试的口径）写：正文用默认停顿共 213 帧，
// 入场第 138 帧、退场第 168 帧（灯到第 180 帧）
describe("planEpisode: intro and outro", () => {
  const scored = lampScene(
    { action: "enter", offset: 0 },
    { action: "exit", offset: 1 },
  );
  const plan = (options?: Parameters<typeof planWithBookends>[3]) =>
    planWithBookends(MANIFEST, ...withEveryScene(MANIFEST, scored, DECLARATIONS), options);

  it("uses the project's intro and outro by default: total = intro + body + outro", () => {
    const { timeline } = plan();
    expect(timeline).toMatchObject({ introFrames: 422, outroFrames: 324 });
    expect(timeline.totalFrames).toBe(422 + 213 + 324);
  });

  it("starts the body right after the intro and ends the last scene and segment where the outro starts", () => {
    const { timeline } = plan();
    expect(timeline.lines[0]).toMatchObject({ startFrame: 422, endFrame: 482 });
    expect(timeline.lines.at(-1)!.endFrame).toBe(635);
    expect(timeline.scenes.map((s) => [s.startFrame, s.endFrame])).toEqual([
      [422, 560],
      [560, 635],
    ]);
    expect(timeline.segments.map((s) => [s.startFrame, s.endFrame])).toEqual([
      [422, 560],
      [560, 635],
    ]);
  });

  it("shifts trigger frames and sound frames by the intro", () => {
    const [cue] = plan().cues;
    expect(cue).toMatchObject({
      startFrame: 560,
      endFrame: 602,
      enter: { frame: 560 },
      exit: { frame: 590 },
    });
    const sounded = planWithBookends(
      MANIFEST,
      ...withEveryScene(
        MANIFEST,
        lampScene(
          { action: "enter", offset: 0 },
          { action: "state", offset: 1, state: "broken" },
        ),
        NOISY,
      ),
    );
    expect(sounded.sounds.map((s) => s.frame)).toEqual([560, 590]);
  });

  it("plays the music from the end of the intro to the end of the body, fading over the body's last 2 seconds", () => {
    expect(plan().music).toEqual({
      track: "forgotten-path",
      startFrame: 422,
      endFrame: 635,
      fadeFrom: 635 - 60,
    });
  });

  it("shows no subtitle and no title during the intro and the outro", () => {
    const { timeline } = plan();
    expect(lineAt(timeline, 421)).toBeUndefined();
    expect(showsResidents(timeline, 0)).toBe(false);
    expect(showsResidents(timeline, 421)).toBe(false);
    expect(showsResidents(timeline, 422)).toBe(true);
    expect(showsResidents(timeline, 634)).toBe(true);
    expect(showsResidents(timeline, 635)).toBe(false);
    expect(showsResidents(timeline, 958)).toBe(false);
  });

  it("can leave out the intro: body from frame 0, triggers not shifted, outro still at the end", () => {
    const p = plan({ intro: null });
    expect(p.timeline).toMatchObject({ introFrames: 0, outroFrames: 324, totalFrames: 213 + 324 });
    expect(p.cues[0]).toMatchObject({ enter: { frame: 138 }, exit: { frame: 168 } });
    expect(p.music).toEqual({ track: "forgotten-path", startFrame: 0, endFrame: 213, fadeFrom: 153 });
    expect(showsResidents(p.timeline, 0)).toBe(true);
    expect(showsResidents(p.timeline, 213)).toBe(false);
  });

  it("can leave out the outro: the episode ends with the body's last line", () => {
    const p = plan({ outro: null });
    expect(p.timeline).toMatchObject({ introFrames: 422, outroFrames: 0, totalFrames: 422 + 213 });
    expect(p.cues[0]).toMatchObject({ enter: { frame: 560 }, exit: { frame: 590 } });
    expect(p.music).toEqual({ track: "forgotten-path", startFrame: 422, endFrame: 635, fadeFrom: 575 });
    expect(showsResidents(p.timeline, 634)).toBe(true);
  });

  it("can leave out both (component sample pages)", () => {
    const p = plan({ intro: null, outro: null });
    expect(p.timeline).toMatchObject({ introFrames: 0, outroFrames: 0, totalFrames: 213 });
    expect(p.cues[0]).toMatchObject({ enter: { frame: 138 }, exit: { frame: 168 } });
  });

  it("refuses an intro or outro that is not registered, listing the registered ones", () => {
    expect(() => plan({ outro: "nope" as never })).toThrow("片尾 nope 没有登记；登记过的：bye-bye");
    expect(() => plan({ intro: "nope" as never })).toThrow(
      "片头 nope 没有登记；登记过的：load-pixel-book",
    );
  });
});
