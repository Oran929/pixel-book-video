import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { VIDEO } from "../video-config";
import { exportTimeline } from "./export-timeline";
import type { EpisodeManifest } from "./manifest";
import { computeTimeline, DEFAULT_PAUSES } from "./timeline";

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
  segments: [
    { id: "s01", title: "开场" },
    { id: "s02", title: "原则" },
  ],
  scenes: [
    { id: "s01-c01", segment: "s01", description: "一个方块" },
    { id: "s02-c01", segment: "s02", description: "一个方块" },
  ],
  lines: [
    line("s01-l01", "s01-c01", 2.01),
    line("s01-l02", "s01-c01", 1.5),
    line("s02-l01", "s02-c01", 2.5),
  ],
};

const STORYBOARD = {
  scenes: [
    {
      scene: "s02-c01",
      components: [
        { id: "dry", component: "PixelBlock", props: { label: "DRY", size: "medium" }, at: [0, 0] },
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

let episode: string;
const write = (name: string, data: unknown) =>
  writeFileSync(join(episode, name), JSON.stringify(data));
const read = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as unknown;

beforeEach(() => {
  episode = mkdtempSync(join(tmpdir(), "episode-"));
  write("episode.json", MANIFEST);
});

describe("exportTimeline", () => {
  it("writes timeline.json equal to computing the timeline directly, plus the duration report", () => {
    exportTimeline(episode);

    // 61 + 9（句间）+ 45 + 24（换画面）+ 75 = 214 帧 ≈ 7.13 秒
    expect(read(join(episode, "timeline.json"))).toEqual({
      ...computeTimeline(MANIFEST, DEFAULT_PAUSES, VIDEO.fps),
      duration: {
        seconds: 214 / 30,
        text: "0:07",
        verdict: "too-short",
        verdictText: "太短（目标 4:00–6:00，只报告）",
        // 这份合成清单没有片尾这一段
        body: { seconds: 214 / 30, text: "0:07" },
        outro: null,
      },
    });
  });

  it("writes segments.txt next to the episode's timeline.json", () => {
    write("storyboard.json", STORYBOARD);

    const { segmentsFile } = exportTimeline(episode);

    // s02 从 61 + 36（覆盖的 1.2 秒）+ 45 + 24 = 166 帧 ≈ 5.53 秒开始
    expect(segmentsFile).toBe(join(episode, "segments.txt"));
    expect(readFileSync(join(episode, "segments.txt"), "utf8")).toBe(
      "00:00 开场\n00:05 原则\n",
    );
  });

  it("applies the storyboard's pause overrides when the episode has one", () => {
    write("storyboard.json", STORYBOARD);

    exportTimeline(episode);

    expect(read(join(episode, "timeline.json"))).toMatchObject(
      computeTimeline(MANIFEST, DEFAULT_PAUSES, VIDEO.fps, { "s01-l01": 1.2 }),
    );
  });

  it("can ignore the storyboard and write elsewhere, to audition the default pauses", () => {
    write("storyboard.json", STORYBOARD);
    const out = join(mkdtempSync(join(tmpdir(), "out-")), "defaults.json");

    const { segmentsFile } = exportTimeline(episode, {
      storyboard: false,
      out,
    });

    expect(read(out)).toMatchObject(
      computeTimeline(MANIFEST, DEFAULT_PAUSES, VIDEO.fps),
    );
    expect(existsSync(join(episode, "timeline.json"))).toBe(false);
    // 打点时间表只跟期目录里的 timeline.json 一起写，试听用的时间轴不写
    expect(segmentsFile).toBeNull();
    expect(existsSync(join(episode, "segments.txt"))).toBe(false);
    expect(existsSync(join(dirname(out), "segments.txt"))).toBe(false);
  });

  it("rejects an invalid storyboard instead of silently using default pauses", () => {
    write("storyboard.json", {
      ...STORYBOARD,
      pauses: [{ after: "s09-l01", seconds: 1 }],
    });

    expect(() => exportTimeline(episode)).toThrow(
      /分镜格式不对[\s\S]*s09-l01 不存在/,
    );
  });

  it("rejects a trigger outside its scene, like the render would, before rendering", () => {
    // s02-l01 是画面 s02-c01 的第一句，负偏移让触发帧落到画面之前
    const [scene] = STORYBOARD.scenes;
    const [trigger] = scene!.triggers;
    write("storyboard.json", {
      ...STORYBOARD,
      scenes: [{ ...scene, triggers: [{ ...trigger, offset: -0.5 }] }],
    });

    expect(() => exportTimeline(episode)).toThrow(/早于画面 s02-c01 的开始帧/);
    expect(existsSync(join(episode, "timeline.json"))).toBe(false);
  });
});
