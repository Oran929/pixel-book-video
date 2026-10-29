import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { VIDEO } from "../video-config";
import { exportTimeline } from "./export-timeline";
import type { EpisodeManifest } from "./manifest";
import { computeTimeline, DEFAULT_PAUSES } from "./timeline";

// 项目配置选的片头（#50，422 帧）和片尾（#51，324 帧）：导出的时间轴和渲染一样，
// 正文接在片头后面，片尾接在正文后面
const BOOKENDS = { introFrames: 422, outroFrames: 324 };

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
    { id: "s02-c01", segment: "s02", description: "一个写着 DRY 的方块" },
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
        { id: "dry", component: "PixelBlock", props: { label: "DRY", size: "medium", color: "orange" }, at: [0, 0] },
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
  music: "pixel-sprinter",
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

    // 片头 422 帧，正文 61 + 9（句间）+ 45 + 24（换画面）+ 75 = 214 帧 ≈ 7.13 秒，片尾 324 帧
    expect(read(join(episode, "timeline.json"))).toEqual({
      ...computeTimeline(MANIFEST, DEFAULT_PAUSES, VIDEO.fps, {}, BOOKENDS),
      duration: {
        seconds: (422 + 214 + 324) / 30,
        text: "0:32",
        verdict: "too-short",
        verdictText: "太短（目标 4:00–6:00，只报告）",
        intro: { seconds: 422 / 30, text: "0:14" },
        body: { seconds: 214 / 30, text: "0:07" },
        outro: { seconds: 10.8, text: "0:10" },
      },
      // 没有分镜：不放音效，也不放配乐
      sounds: [],
      music: null,
    });
  });

  it("lists the storyboard's sound effects (frame, sound ID) for checking the rendered audio", () => {
    write("storyboard.json", STORYBOARD);

    exportTimeline(episode);

    // s02-l01 从片头后的第 166 帧（422 + 166 = 588）开始，知识块在 0.5 秒（15 帧）后入场，默认音效 drop
    expect(read(join(episode, "timeline.json"))).toMatchObject({
      sounds: [{ frame: 603, sound: "drop" }],
    });
  });

  it("names the storyboard's music and the frame its fade-out starts", () => {
    write("storyboard.json", STORYBOARD);

    exportTimeline(episode);

    // 片头 422 帧之后才放配乐，正文到第 422 + 61 + 36 + 45 + 24 + 75 = 663 帧结束，
    // 在这之前的 60 帧淡出，片尾（324 帧）期间不放；
    // 文件、循环长度（Pixel Sprinter 34.3 秒 = 1029 帧）和音量供全长试验找接缝、做参照
    expect(read(join(episode, "timeline.json"))).toMatchObject({
      totalFrames: 663 + 324,
      music: {
        track: "pixel-sprinter",
        startFrame: 422,
        endFrame: 663,
        fadeFrom: 603,
        file: "music/pixel-sprinter.ogg",
        loopFrames: 1029,
        volumeDb: -20,
      },
    });
  });

  it("writes segments.txt next to the episode's timeline.json", () => {
    write("storyboard.json", STORYBOARD);

    const { segmentsFile } = exportTimeline(episode);

    // 正文在片头 422 帧（≈ 14.07 秒）后开始；s02 从 422 + 61 + 36（覆盖的 1.2 秒）+ 45 + 24
    // = 588 帧 ≈ 19.6 秒开始
    expect(segmentsFile).toBe(join(episode, "segments.txt"));
    expect(readFileSync(join(episode, "segments.txt"), "utf8")).toBe(
      "00:00 片头\n00:14 开场\n00:19 原则\n",
    );
  });

  it("applies the storyboard's pause overrides when the episode has one", () => {
    write("storyboard.json", STORYBOARD);

    exportTimeline(episode);

    expect(read(join(episode, "timeline.json"))).toMatchObject(
      computeTimeline(MANIFEST, DEFAULT_PAUSES, VIDEO.fps, { "s01-l01": 1.2 }, BOOKENDS),
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
      computeTimeline(MANIFEST, DEFAULT_PAUSES, VIDEO.fps, {}, BOOKENDS),
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
      music: "pixel-sprinter",
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
