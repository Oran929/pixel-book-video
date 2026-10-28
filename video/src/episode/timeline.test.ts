import { describe, expect, it } from "vitest";
import type { EpisodeManifest } from "./manifest";
import { computeTimeline, DEFAULT_PAUSES, lineAt } from "./timeline";

const line = (id: string, scene: string, seconds: number) => ({
  id,
  scene,
  text: `字幕 ${id}`,
  audio: `episode/${id}-00000000.wav`,
  seconds,
});

// 两段：s01 有两个画面，s02 有一个画面
const MANIFEST: EpisodeManifest = {
  segments: [
    { id: "s01", title: "开场" },
    { id: "s02", title: "原则" },
  ],
  scenes: [
    { id: "s01-c01", segment: "s01" },
    { id: "s01-c02", segment: "s01" },
    { id: "s02-c01", segment: "s02" },
  ],
  lines: [
    line("s01-l01", "s01-c01", 2),
    line("s01-l02", "s01-c01", 1.5),
    line("s01-l03", "s01-c02", 1),
    line("s02-l01", "s02-c01", 2.5),
  ],
};

describe("computeTimeline", () => {
  it("separates lines in the same scene by 0.3s (9 frames at 30fps)", () => {
    const timeline = computeTimeline(MANIFEST, DEFAULT_PAUSES, 30);

    expect(timeline.lines[0]).toMatchObject({ startFrame: 0, endFrame: 60 });
    expect(timeline.lines[1]).toMatchObject({ startFrame: 69, endFrame: 114 });
  });

  it("pauses 0.8s (24 frames) on a scene change, including a segment change", () => {
    const timeline = computeTimeline(MANIFEST, DEFAULT_PAUSES, 30);

    expect(timeline.lines[2]).toMatchObject({ startFrame: 138, endFrame: 168 });
    expect(timeline.lines[3]).toMatchObject({ startFrame: 192, endFrame: 267 });
  });

  it("ends the video when the last line's audio ends", () => {
    expect(computeTimeline(MANIFEST, DEFAULT_PAUSES, 30).totalFrames).toBe(267);
  });

  it("spans each scene and segment from its first line to the next one's start", () => {
    const timeline = computeTimeline(MANIFEST, DEFAULT_PAUSES, 30);

    expect(timeline.scenes).toEqual([
      { id: "s01-c01", segment: "s01", startFrame: 0, endFrame: 138 },
      { id: "s01-c02", segment: "s01", startFrame: 138, endFrame: 192 },
      { id: "s02-c01", segment: "s02", startFrame: 192, endFrame: 267 },
    ]);
    expect(timeline.segments).toEqual([
      { id: "s01", title: "开场", startFrame: 0, endFrame: 192 },
      { id: "s02", title: "原则", startFrame: 192, endFrame: 267 },
    ]);
  });

  it("gives the same timeline for the same input", () => {
    expect(computeTimeline(MANIFEST, DEFAULT_PAUSES, 30)).toEqual(
      computeTimeline(structuredClone(MANIFEST), DEFAULT_PAUSES, 30),
    );
  });

  it("never gives a line fewer frames than its audio needs", () => {
    // 实测时长常是 24kHz 采样数换算的小数，例如 2.645166… 秒
    const durations = [2.645166666666667, 1.1, 0.1, 2.0333, 3.3, 59 / 30 + 1e-9];
    const manifest: EpisodeManifest = {
      segments: [{ id: "s01", title: "开场" }],
      scenes: [{ id: "s01-c01", segment: "s01" }],
      lines: durations.map((seconds, i) => line(`s01-l0${i}`, "s01-c01", seconds)),
    };

    const timeline = computeTimeline(manifest, DEFAULT_PAUSES, 30);

    timeline.lines.forEach((timed, i) => {
      expect((timed.endFrame - timed.startFrame) * (1 / 30)).toBeGreaterThanOrEqual(
        durations[i]!,
      );
    });
    // 向上取整到整帧：59/30 秒多一点点也要 60 帧
    const last = timeline.lines.at(-1)!;
    expect(last.endFrame - last.startFrame).toBe(60);
  });

  it("rounds pauses to the nearest frame", () => {
    const timeline = computeTimeline(
      MANIFEST,
      { betweenLines: 0.31, sceneChange: 0.85 },
      30,
    );

    expect(timeline.lines[1]!.startFrame - timeline.lines[0]!.endFrame).toBe(9);
    expect(timeline.lines[2]!.startFrame - timeline.lines[1]!.endFrame).toBe(26);
  });
});

describe("lineAt", () => {
  const timeline = computeTimeline(MANIFEST, DEFAULT_PAUSES, 30);

  it("shows a line from its start until the next line starts", () => {
    expect(lineAt(timeline, 0)?.id).toBe("s01-l01");
    expect(lineAt(timeline, 68)?.id).toBe("s01-l01");
    expect(lineAt(timeline, 69)?.id).toBe("s01-l02");
    expect(lineAt(timeline, 266)?.id).toBe("s02-l01");
  });
});
