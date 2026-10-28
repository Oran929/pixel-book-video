import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  segments: [
    { id: "s01", title: "开场" },
    { id: "s02", title: "原则" },
  ],
  scenes: [
    { id: "s01-c01", segment: "s01" },
    { id: "s02-c01", segment: "s02" },
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
  it("writes timeline.json equal to computing the timeline directly", () => {
    exportTimeline(episode);

    expect(read(join(episode, "timeline.json"))).toEqual(
      computeTimeline(MANIFEST, DEFAULT_PAUSES, VIDEO.fps),
    );
  });

  it("applies the storyboard's pause overrides when the episode has one", () => {
    write("storyboard.json", STORYBOARD);

    exportTimeline(episode);

    expect(read(join(episode, "timeline.json"))).toEqual(
      computeTimeline(MANIFEST, DEFAULT_PAUSES, VIDEO.fps, { "s01-l01": 1.2 }),
    );
  });

  it("can ignore the storyboard and write elsewhere, to audition the default pauses", () => {
    write("storyboard.json", STORYBOARD);
    const out = join(mkdtempSync(join(tmpdir(), "out-")), "defaults.json");

    exportTimeline(episode, { storyboard: false, out });

    expect(read(out)).toEqual(
      computeTimeline(MANIFEST, DEFAULT_PAUSES, VIDEO.fps),
    );
    expect(existsSync(join(episode, "timeline.json"))).toBe(false);
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
});
