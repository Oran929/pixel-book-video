// 配乐署名（#52）：用了 CC-BY 曲子的那一期，时间轴导出时在期目录的产物目录 `out/` 里写出 `credits.txt`，
// 一行，可以直接贴进视频简介；CC0 的不写。只在 Node 里用（时间轴导出命令），Remotion 不加载。
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isCcBy, type MusicTrack } from "./tracks";

export const CREDITS_FILE = "credits.txt";

/**
 * 按这一期的配乐写出或删掉产物目录 `outDir` 里的 `credits.txt`：曲子要署名时写出并返回路径；
 * 不要署名（CC0）或没有配乐时不写，并删掉上次留下的（换过曲子），返回 null
 */
export const writeCredits = (outDir: string, track: MusicTrack | null): string | null => {
  const file = join(outDir, CREDITS_FILE);
  if (track && isCcBy(track.license)) {
    writeFileSync(file, `配乐：${track.credit}\n`);
    return file;
  }
  if (existsSync(file)) rmSync(file);
  return null;
};
