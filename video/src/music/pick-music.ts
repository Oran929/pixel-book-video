// 选曲（spec #16 用户故事 52、修订 D5）：给一期的分镜选配乐。
// 分镜里已经有 `music` 时原样保留；否则找同一本书里按章、期排序、排在本期之前、
// 已经有分镜的最近一期，从剩下的曲子里随机选一首；没有这样的一期时从全部曲子里选。
// 随机数由代码生成，不让模型挑。选好的曲子写进期目录的 `storyboard.json`。
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { MUSIC } from "./tracks";

export const STORYBOARD_FILE = "storyboard.json";

export type MusicPick = {
  /** 选中（或保留）的曲子 ID */
  track: string;
  /** 分镜里原来就有 `music`，原样保留 */
  kept: boolean;
  /** 避开的曲子和用它的那一期（`<章>/<期>`）；没有之前的有分镜的一期，或保留了原有的，为 null */
  avoided: { track: string; episode: string } | null;
};

export type PickOptions = {
  /** 可选的曲子 ID，默认是配乐登记表里的全部 */
  tracks?: readonly string[];
  /** [0, 1) 的随机数，默认 Math.random；测试可以换成固定的 */
  random?: () => number;
};

const CHAPTER = /^ch(\d+)$/;
const EPISODE = /^ep(\d+)$/;

const subdirs = (dir: string, pattern: RegExp) =>
  readdirSync(dir)
    .filter((name) => pattern.test(name) && statSync(join(dir, name)).isDirectory())
    .map((name) => ({ name, n: Number(pattern.exec(name)![1]) }));

/** 分镜里的 `music`；没有分镜文件时为 undefined（只有字幕版的一期） */
const readStoryboard = (dir: string): Record<string, unknown> | undefined => {
  const path = join(dir, STORYBOARD_FILE);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${path} 不是合法的 JSON：${(error as Error).message}`);
  }
};

const musicOf = (storyboard: Record<string, unknown> | undefined) =>
  typeof storyboard?.music === "string" ? storyboard.music : undefined;

/** 本期之前、已经有分镜（带 `music`）的最近一期 */
const previousScored = (book: string, chapter: number, ep: number) => {
  const earlier = subdirs(book, CHAPTER)
    .filter((ch) => ch.n <= chapter)
    .flatMap((ch) =>
      subdirs(join(book, ch.name), EPISODE)
        .filter((e) => ch.n < chapter || e.n < ep)
        .map((e) => ({ chapter: ch.n, ep: e.n, episode: join(ch.name, e.name) })),
    )
    .sort((a, b) => b.chapter - a.chapter || b.ep - a.ep);
  for (const candidate of earlier) {
    const track = musicOf(readStoryboard(join(book, candidate.episode)));
    if (track !== undefined) return { track, episode: candidate.episode };
  }
  return null;
};

/** 给期目录 `episodeDir` 的分镜选配乐，写进 `storyboard.json`（已经有 `music` 时不动） */
export const pickMusic = (
  episodeDir: string,
  { tracks = Object.keys(MUSIC), random = Math.random }: PickOptions = {},
): MusicPick => {
  const ep = EPISODE.exec(basename(episodeDir));
  const chapterDir = dirname(episodeDir);
  const chapter = CHAPTER.exec(basename(chapterDir));
  if (!ep || !chapter) {
    throw new Error(`${episodeDir} 不是期目录：要是 books/<书>/ch<章>/ep<期>/`);
  }

  const storyboard = readStoryboard(episodeDir);
  const existing = musicOf(storyboard);
  if (existing !== undefined) return { track: existing, kept: true, avoided: null };

  const avoided = previousScored(dirname(chapterDir), Number(chapter[1]), Number(ep[1]));
  const candidates = tracks.filter((id) => id !== avoided?.track);
  if (candidates.length === 0) throw new Error("没有可选的配乐");
  const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1);
  const track = candidates[index]!;

  const next = storyboard ? { ...storyboard, music: track } : { scenes: [], music: track, pauses: [] };
  writeFileSync(join(episodeDir, STORYBOARD_FILE), `${JSON.stringify(next, null, 2)}\n`);
  return { track, kept: false, avoided };
};
