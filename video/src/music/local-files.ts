// 配乐文件只留在本机，不进 Git（spec #16 修订四，#53）：CI 上没有曲子文件。
// 要读曲子文件的检查先用这里看缺哪几首，缺了就跳过并打印一行说明。
import { existsSync } from "node:fs";
import { MUSIC, type MusicId } from "./tracks";

/** 曲子文件的获取方法 */
export const MUSIC_README = "video/public/music/README.md";

/** 登记表里哪几首的文件不在 `publicDir`（Remotion 的静态目录，以 `/` 结尾的 URL）下 */
export const missingMusicFiles = (publicDir: URL): MusicId[] =>
  (Object.keys(MUSIC) as MusicId[]).filter(
    (id) => !existsSync(new URL(MUSIC[id].file, publicDir)),
  );

export const missingMusicNote = (missing: readonly string[]): string =>
  `本机缺配乐文件 ${missing.join("、")}，跳过要读曲子文件的检查；获取方法见 ${MUSIC_README}`;
