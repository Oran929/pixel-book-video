import { describe, expect, it } from "vitest";
import { z } from "zod";
import { planEpisode } from "../episode/episode-plan";
import { declareComponent } from "./declaration";
import { stageAt } from "./stage";

// 组件渲染时拿到的「舞台信息」：从排期和当前帧算出，交给组件自己决定怎么画
const MANIFEST = {
  voice_fingerprint: "3f2a9c0d1e4b5a6f",
  title: "样例",
  segments: [{ id: "s01", title: "开场" }],
  scenes: [{ id: "s01-c01", segment: "s01", description: "一盏灯" }],
  lines: [
    { id: "s01-l01", scene: "s01-c01", text: "灯", audio: "a.wav", seconds: 10 },
  ],
};

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

const lamp = (triggers: Record<string, unknown>[]) => {
  const { cues } = planEpisode(
    MANIFEST,
    {
      scenes: [
        {
          scene: "s01-c01",
          components: [{ id: "lamp", component: "Lamp", props: {}, at: [0, 0] }],
          triggers: triggers.map((t) => ({ target: "lamp", line: "s01-l01", ...t })),
        },
      ],
      pauses: [],
    },
    DECLARATIONS,
  );
  return cues[0]!;
};

// 30fps：入场第 0 帧（fade 12 帧），第 15 帧切到 on，第 45 帧切到 broken，
// 第 60 帧退场（slide 12 帧，到第 72 帧）
const cue = lamp([
  { action: "enter", offset: 0 },
  { action: "state", offset: 0.5, state: "on" },
  { action: "state", offset: 1.5, state: "broken" },
  { action: "exit", offset: 2 },
]);

describe("stageAt", () => {
  it.each([
    [0, { state: "off", stateFrames: 0, enter: 0, exit: 0 }],
    [6, { state: "off", stateFrames: 6, enter: 0.5, exit: 0 }],
    [12, { state: "off", stateFrames: 12, enter: 1, exit: 0 }],
    [22, { state: "on", stateFrames: 7, enter: 1, exit: 0 }],
    [45, { state: "broken", stateFrames: 0, enter: 1, exit: 0 }],
    [66, { state: "broken", stateFrames: 21, enter: 1, exit: 0.5 }],
    [71, { state: "broken", stateFrames: 26, enter: 1, exit: 11 / 12 }],
  ])("at frame %i", (frame, stage) => {
    expect(stageAt(cue, frame)).toEqual(stage);
  });

  it("has finished entering on the entrance frame when the animation is none", () => {
    const instant = lamp([{ action: "enter", offset: 0, animation: "none" }]);

    expect(stageAt(instant, 0)).toMatchObject({ enter: 1, exit: 0 });
  });
});
