import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { pickMusic } from "./pick-music";

// 选曲命令（spec #16 用户故事 52、修订 D5）：在一本书的目录树里排出本期之前最近的、
// 有分镜的一期，避开它用的曲子，用传进来的随机数从剩下的里面选
const TRACKS = ["alpha", "beta", "gamma"];

let book: string;
beforeEach(() => {
  book = mkdtempSync(join(tmpdir(), "book-"));
});

/** 建一个期目录；`music` 给了就写一份带这首配乐的分镜，没给就是只有字幕版的一期 */
const episode = (chapter: string, ep: string, storyboard?: Record<string, unknown>) => {
  const dir = join(book, chapter, ep);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "script.yaml"), "segments: []\n");
  if (storyboard) writeFileSync(join(dir, "storyboard.json"), JSON.stringify(storyboard));
  return dir;
};
const scored = (music: string) => ({ scenes: [], music, pauses: [] });
const storyboardOf = (dir: string) =>
  JSON.parse(readFileSync(join(dir, "storyboard.json"), "utf8")) as Record<string, unknown>;

/** 总是取第 `i` 首（共 `n` 首可选时）的随机数 */
const nth = (i: number, n: number) => () => (i + 0.5) / n;

describe("pickMusic", () => {
  it("keeps the music already in the storyboard and does not touch the file", () => {
    episode("ch01", "ep01", scored("alpha"));
    const dir = episode("ch01", "ep02", { ...scored("alpha"), pauses: [{ after: "x", seconds: 1 }] });
    const before = readFileSync(join(dir, "storyboard.json"), "utf8");

    expect(pickMusic(dir, { tracks: TRACKS, random: nth(0, 3) })).toEqual({
      track: "alpha",
      kept: true,
      avoided: null,
    });
    expect(readFileSync(join(dir, "storyboard.json"), "utf8")).toBe(before);
  });

  it("picks from every track for the book's first episode and starts the storyboard", () => {
    const dir = episode("ch01", "ep01");

    expect(pickMusic(dir, { tracks: TRACKS, random: nth(2, 3) })).toEqual({
      track: "gamma",
      kept: false,
      avoided: null,
    });
    expect(storyboardOf(dir)).toEqual({ scenes: [], music: "gamma", pauses: [] });
  });

  it("adds the music to a storyboard that has none yet, keeping what is there", () => {
    const dir = episode("ch01", "ep01", { scenes: [{ scene: "s01-c01" }], pauses: [] });

    pickMusic(dir, { tracks: TRACKS, random: nth(0, 3) });

    expect(storyboardOf(dir)).toEqual({ scenes: [{ scene: "s01-c01" }], pauses: [], music: "alpha" });
  });

  it("avoids the previous episode's track when that episode is in another chapter", () => {
    episode("ch01", "ep01", scored("gamma"));
    episode("ch01", "ep02", scored("alpha"));
    const dir = episode("ch02", "ep01");

    expect(pickMusic(dir, { tracks: TRACKS, random: nth(0, 2) })).toEqual({
      track: "beta",
      kept: false,
      avoided: { track: "alpha", episode: join("ch01", "ep02") },
    });
  });

  it("orders chapters and episodes by number, not as text", () => {
    episode("ch2", "ep01", scored("alpha"));
    episode("ch10", "ep01", scored("beta"));
    const dir = episode("ch10", "ep02");

    expect(pickMusic(dir, { tracks: TRACKS, random: nth(0, 2) }).avoided).toEqual({
      track: "beta",
      episode: join("ch10", "ep01"),
    });
  });

  it("ignores episodes after this one", () => {
    const dir = episode("ch01", "ep01");
    episode("ch01", "ep02", scored("alpha"));

    expect(pickMusic(dir, { tracks: TRACKS, random: nth(0, 3) }).avoided).toBeNull();
  });

  it("skips an earlier episode that only has subtitles (no storyboard) and keeps looking", () => {
    episode("ch01", "ep01", scored("beta"));
    episode("ch01", "ep02");
    const dir = episode("ch01", "ep03");

    expect(pickMusic(dir, { tracks: TRACKS, random: nth(1, 2) })).toEqual({
      track: "gamma",
      kept: false,
      avoided: { track: "beta", episode: join("ch01", "ep01") },
    });
  });

  it("never picks the previous episode's track, whatever the random number", () => {
    episode("ch01", "ep01", scored("beta"));
    const dir = episode("ch01", "ep02");
    const picked = new Set(
      [0, 0.3, 0.5, 0.7, 0.999].map((r) => {
        writeFileSync(join(dir, "storyboard.json"), JSON.stringify({ scenes: [], pauses: [] }));
        return pickMusic(dir, { tracks: TRACKS, random: () => r }).track;
      }),
    );

    expect(picked).toEqual(new Set(["alpha", "gamma"]));
  });

  it("picks from every track when the previous track is no longer registered", () => {
    episode("ch01", "ep01", scored("retired"));
    const dir = episode("ch01", "ep02");

    expect(pickMusic(dir, { tracks: TRACKS, random: nth(1, 3) })).toMatchObject({
      track: "beta",
      avoided: { track: "retired" },
    });
  });

  it("refuses a directory that is not an episode under a chapter", () => {
    expect(() => pickMusic(book, { tracks: TRACKS })).toThrow(/期目录/);
  });
});
