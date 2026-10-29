import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planEpisode } from "./episode-plan";

// ep01 全长音频试验（#39）：最简分镜，只放几个知识块（带音效），配乐用最短的 Pixel Sprinter。
// `pixelbook music-trial … --storyboard` 用这份分镜给 ch02 ep01 出片，检查配乐的循环接缝和淡出。
// 合成清单是 ep01 摆放试验（#34）的那份。
const read = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8"),
  ) as unknown;

describe("ep01 全长音频试验的分镜", () => {
  const plan = planEpisode(
    read("ep01-episode.json"),
    read("ep01-music-trial.storyboard.json"),
  );

  it("用 Pixel Sprinter 从片头结束垫到正文结束，正文最后 60 帧淡出，不覆盖片尾", () => {
    const bodyEnd = plan.timeline.totalFrames - 324;
    expect(plan.music).toEqual({
      track: "pixel-sprinter",
      startFrame: 422,
      endFrame: bodyEnd,
      fadeFrom: bodyEnd - 60,
    });
    // 全长约 4 分半，比 Pixel Sprinter 的一次循环（1029 帧）长得多
    expect(plan.timeline.totalFrames).toBeGreaterThan(7 * 1029);
  });

  it("组件入场、退场、切换状态都放音效", () => {
    expect(new Set(plan.sounds.map((cue) => cue.sound))).toEqual(
      new Set(["drop", "leave", "blip"]),
    );
  });
});
