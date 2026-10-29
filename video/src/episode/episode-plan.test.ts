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
        { id: "dry", component: "PixelBlock", props: { label: "DRY" } },
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
      components: [{ id: "lamp", component: "Lamp", props: {} }],
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
