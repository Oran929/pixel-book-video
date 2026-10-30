import { describe, expect, it } from "vitest";
import { z } from "zod";
import { declareComponent } from "../components/declaration";
import type { EpisodeManifest } from "./manifest";
import { parseStoryboard, pauseOverrides, scheduleCues } from "./storyboard";
import { computeTimeline, DEFAULT_PAUSES } from "./timeline";
import { withEveryScene } from "./fixtures/every-scene";

const line = (id: string, scene: string, seconds: number) => ({
  id,
  scene,
  text: `字幕 ${id}`,
  audio: `episode/${id}-00000000.wav`,
  seconds,
});

const MANIFEST: EpisodeManifest = {
  voice_fingerprint: "3f2a9c0d1e4b5a6f",
  title: "程序员修炼之道",
  segments: [{ id: "s01", title: "开场" }],
  scenes: [
    { id: "s01-c01", segment: "s01", description: "一个方块" },
    { id: "s01-c02", segment: "s01", description: "一个方块" },
  ],
  lines: [
    line("s01-l01", "s01-c01", 2),
    line("s01-l02", "s01-c01", 1.5),
    line("s01-l03", "s01-c02", 1),
    line("s01-l04", "s01-c02", 2),
  ],
};

// 假的组件声明：只关心组件名和参数格式
const COMPONENTS = {
  Box: declareComponent({
    effect: "测试用",
    suitedFor: "测试用",
    props: z.object({ label: z.string() }),
    states: ["normal"],
    cells: () => [1, 1],
    enter: "fade",
    exit: "fade",
    connector: false,
    sounds: { enter: null, exit: null, states: { normal: null } },
  }),
};

const STORYBOARD = {
  scenes: [
    {
      scene: "s01-c02",
      components: [{ id: "dry", component: "Box", props: { label: "DRY" }, at: [0, 0] }],
      triggers: [
        {
          target: "dry",
          line: "s01-l03",
          offset: -0.2,
          action: "enter",
          animation: "slide",
        },
      ],
    },
  ],
  music: "forgotten-path",
  pauses: [{ after: "s01-l02", seconds: 1.2 }],
};

// 分镜没写到的画面补一个占位组件（每个画面至少一个组件，检查本身在 episode-plan.test.ts）
const parse = (data: unknown) => {
  const [filled, components] = withEveryScene(MANIFEST, data, COMPONENTS);
  return parseStoryboard(filled, MANIFEST, components);
};

describe("parseStoryboard", () => {
  it("accepts a storyboard that only references existing lines and components", () => {
    expect(parse(STORYBOARD).scenes[0]).toEqual(STORYBOARD.scenes[0]);
  });

  it("names the scene and trigger whose line does not exist", () => {
    const data = structuredClone(STORYBOARD);
    data.scenes[0]!.triggers[0]!.line = "s09-l01";

    expect(() => parse(data)).toThrow(
      /第 1 个画面 第 1 个触发.*旁白句 s09-l01 不存在/,
    );
  });

  type Data = typeof STORYBOARD;
  const edited = (edit: (data: Data) => void) => {
    const data = structuredClone(STORYBOARD);
    edit(data);
    return data;
  };

  it.each([
    [
      "a line from another scene",
      edited((d) => (d.scenes[0]!.triggers[0]!.line = "s01-l01")),
      /第 1 个画面 第 1 个触发 line: 旁白句 s01-l01 不属于画面 s01-c02/,
    ],
    [
      "a component missing from the registry",
      edited((d) => (d.scenes[0]!.components[0]!.component = "Circle")),
      /第 1 个画面 第 1 个组件 component: 组件 Circle 不在组件注册表里/,
    ],
    [
      "props the component does not accept",
      edited((d) => (d.scenes[0]!.components[0]!.props = { label: 3 } as never)),
      /第 1 个画面 第 1 个组件 props label:/,
    ],
    [
      "a trigger aimed at a component the scene does not use",
      edited((d) => (d.scenes[0]!.triggers[0]!.target = "wet")),
      /第 1 个画面 第 1 个触发 target: 本画面没有组件 wet/,
    ],
    [
      "a scene missing from the manifest",
      edited((d) => (d.scenes[0]!.scene = "s09-c01")),
      /第 1 个画面 scene: 画面 s09-c01 不存在/,
    ],
    [
      "a pause after a line that does not exist",
      edited((d) => (d.pauses[0]!.after = "s09-l01")),
      /第 1 个停顿覆盖 after: 旁白句 s09-l01 不存在/,
    ],
    [
      "a negative pause",
      edited((d) => (d.pauses[0]!.seconds = -0.1)),
      /第 1 个停顿覆盖 seconds:/,
    ],
    [
      "a component that never enters",
      edited((d) => (d.scenes[0]!.triggers = [])),
      /第 1 个画面 第 1 个组件: 组件 dry 没有 enter 触发/,
    ],
    [
      "a component that enters twice",
      edited((d) => d.scenes[0]!.triggers.push({ ...d.scenes[0]!.triggers[0]! })),
      /第 1 个画面 第 2 个触发: 组件 dry 已经有 enter 触发/,
    ],
    [
      "two components with the same id in a scene",
      edited((d) => d.scenes[0]!.components.push({ ...d.scenes[0]!.components[0]! })),
      /第 1 个画面 第 2 个组件 id: 本画面已有组件 dry/,
    ],
    [
      "the same scene listed twice",
      edited((d) => d.scenes.push(structuredClone(d.scenes[0]!))),
      /第 2 个画面 scene: 画面 s01-c02 已经写过/,
    ],
    [
      "a pause after the last line",
      edited((d) => (d.pauses[0]!.after = "s01-l04")),
      /第 1 个停顿覆盖 after: s01-l04 是最后一句/,
    ],
    [
      "two overrides for the same pause",
      edited((d) => d.pauses.push({ ...d.pauses[0]! })),
      /第 2 个停顿覆盖 after: s01-l02 之后的停顿已经覆盖过/,
    ],
  ])("rejects %s and says where", (_, data, message) => {
    expect(() => parse(data)).toThrow(message);
  });
});

describe("pauseOverrides", () => {
  it("maps each overridden line to the pause after it", () => {
    expect(pauseOverrides(parse(STORYBOARD))).toEqual({ "s01-l02": 1.2 });
  });
});

describe("scheduleCues", () => {
  // 30fps、默认停顿：s01-c02 从第 138 帧开始，到第 237 帧（总帧数）结束；
  // s01-l03 从第 138 帧开始，s01-l04 从第 177 帧开始
  const timeline = computeTimeline(MANIFEST, DEFAULT_PAUSES, 30);
  const [, FILLED] = withEveryScene(MANIFEST, null, COMPONENTS);
  const enteringOn = (line: string, offset: number) =>
    parse({
      scenes: [
        {
          ...STORYBOARD.scenes[0]!,
          triggers: [{ ...STORYBOARD.scenes[0]!.triggers[0]!, line, offset }],
        },
      ],
      music: "forgotten-path",
      pauses: [],
    });

  it("shows the component from its line's start until the scene ends", () => {
    const [cue] = scheduleCues(enteringOn("s01-l04", 0), timeline, FILLED);
    expect([cue]).toEqual([
      {
        key: "s01-c02/dry",
        component: "Box",
        props: { label: "DRY" },
        enter: { frame: 177, animation: "slide", frames: 12, sound: null },
        exit: null,
        initialState: "normal",
        states: [],
        area: { at: [0, 0], cells: [1, 1] },
        ends: null,
        startFrame: 177,
        endFrame: 237,
      },
    ]);
  });

  it("lets a negative offset enter before its line starts", () => {
    const [cue] = scheduleCues(enteringOn("s01-l04", -0.5), timeline, FILLED);

    expect(cue!.startFrame).toBe(162);
  });

  it("rounds the trigger to the nearest frame", () => {
    // 177 + 0.517 × 30 = 192.51
    const [cue] = scheduleCues(enteringOn("s01-l04", 0.517), timeline, FILLED);

    expect(cue!.startFrame).toBe(193);
  });

  it("allows a trigger exactly on the scene start", () => {
    const [cue] = scheduleCues(enteringOn("s01-l04", -1.3), timeline, FILLED);

    expect(cue!.startFrame).toBe(138);
  });

  it("refuses a trigger before its scene starts instead of clipping it", () => {
    // 177 − 1.5 × 30 = 132，早于画面开始帧 138
    expect(() => scheduleCues(enteringOn("s01-l04", -1.5), timeline, FILLED)).toThrow(
      /第 1 个画面 第 1 个触发.*触发帧 132 早于画面 s01-c02 的开始帧 138/,
    );
  });

  it("refuses a trigger after its scene ends", () => {
    expect(() => scheduleCues(enteringOn("s01-l04", 2), timeline, FILLED)).toThrow(
      /第 1 个画面 第 1 个触发.*触发帧 237 不早于画面 s01-c02 的结束帧 237/,
    );
  });
});
