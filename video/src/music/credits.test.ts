import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CREDITS_FILE, writeCredits } from "./credits";
import type { MusicTrack } from "./tracks";

const CC0: MusicTrack = {
  file: "music/demo.ogg",
  title: "Demo",
  author: "Someone",
  source: "https://opengameart.org/content/demo",
  license: "CC0",
  checkedOn: "2026-10-29",
  sampleRate: 44100,
  sampleCount: 1470 * 100,
};

const CC_BY: MusicTrack = {
  ...CC0,
  license: "CC-BY 4.0",
  credit: "\"Demo\" by Someone (https://opengameart.org/content/demo), CC-BY 4.0",
};

let episode: string;
beforeEach(() => {
  episode = mkdtempSync(join(tmpdir(), "episode-"));
});

describe("writeCredits", () => {
  it("用了 CC-BY 曲子时，在期目录里写出一行署名，可以直接贴进视频简介", () => {
    expect(writeCredits(episode, CC_BY)).toBe(join(episode, CREDITS_FILE));
    expect(readFileSync(join(episode, "credits.txt"), "utf8")).toBe(
      "配乐：\"Demo\" by Someone (https://opengameart.org/content/demo), CC-BY 4.0\n",
    );
  });

  it("CC0 的曲子不写署名", () => {
    expect(writeCredits(episode, CC0)).toBeNull();
    expect(existsSync(join(episode, "credits.txt"))).toBe(false);
  });

  it("没有配乐（字幕版）时不写", () => {
    expect(writeCredits(episode, null)).toBeNull();
    expect(existsSync(join(episode, "credits.txt"))).toBe(false);
  });

  it("换成不用署名的曲子后，删掉上次留下的署名", () => {
    writeFileSync(join(episode, "credits.txt"), "配乐：旧的\n");
    writeCredits(episode, CC0);
    expect(existsSync(join(episode, "credits.txt"))).toBe(false);
  });
});
