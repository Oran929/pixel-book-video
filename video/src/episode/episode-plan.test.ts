import { describe, expect, it } from "vitest";
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
