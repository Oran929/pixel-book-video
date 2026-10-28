import { describe, expect, it } from "vitest";
import { durationReport, formatSegmentStart, segmentsText } from "./rhythm";

describe("formatSegmentStart", () => {
  it.each([
    [0, "00:00"],
    [65, "01:05"],
    [59 * 60 + 59, "59:59"],
    [60 * 60, "1:00:00"],
    [2 * 3600 + 3 * 60 + 4, "2:03:04"],
  ])("formats %d seconds as %s", (seconds, text) => {
    expect(formatSegmentStart(seconds)).toBe(text);
  });

  it("rounds fractional seconds down", () => {
    expect(formatSegmentStart(59.99)).toBe("00:59");
    expect(formatSegmentStart(3599.9)).toBe("59:59");
  });
});

describe("segmentsText", () => {
  it("lists each segment's floored start time and title, one per line", () => {
    const segments = [
      { id: "s01", title: "开场", startFrame: 0, endFrame: 89 },
      { id: "s02", title: "原则", startFrame: 89, endFrame: 1799 },
      { id: "s03", title: "例子", startFrame: 1799, endFrame: 108000 },
      { id: "s04", title: "收尾", startFrame: 108000, endFrame: 108300 },
    ];

    expect(segmentsText({ fps: 30, segments })).toBe(
      "00:00 开场\n00:02 原则\n00:59 例子\n1:00:00 收尾\n",
    );
  });
});

describe("durationReport", () => {
  const at30fps = (seconds: number) =>
    durationReport({ fps: 30, totalFrames: Math.round(seconds * 30) });

  it.each([
    [3 * 60 + 59, "3:59", "too-short"],
    [4 * 60, "4:00", "within"],
    [6 * 60, "6:00", "within"],
    [6 * 60 + 1, "6:01", "too-long"],
  ] as const)("judges %d seconds (%s) as %s", (seconds, text, verdict) => {
    expect(at30fps(seconds)).toMatchObject({ text, verdict });
  });

  it.each([
    [3 * 60 + 59, "太短（目标 4:00–6:00，只报告）"],
    [5 * 60, "在 4:00–6:00 之内"],
    [6 * 60 + 1, "太长（目标 4:00–6:00，只报告）"],
  ] as const)(
    "words the verdict for %d seconds against the target range",
    (seconds, verdictText) => {
      expect(at30fps(seconds).verdictText).toBe(verdictText);
    },
  );

  it("reports the exact seconds of the timeline's total frames", () => {
    expect(durationReport({ fps: 30, totalFrames: 565 }).seconds).toBeCloseTo(
      18.8333,
      4,
    );
    expect(durationReport({ fps: 30, totalFrames: 565 }).text).toBe("0:18");
  });

  it("judges the m:ss it shows, so a part-second never contradicts the text", () => {
    expect(at30fps(6 * 60 + 0.9)).toMatchObject({
      text: "6:00",
      verdict: "within",
    });
    expect(at30fps(3 * 60 + 59.9)).toMatchObject({
      text: "3:59",
      verdict: "too-short",
    });
  });
});
