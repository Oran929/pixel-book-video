import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { missingMusicFiles, missingMusicNote } from "./local-files";
import { MUSIC } from "./tracks";

const emptyPublic = () => {
  const dir = mkdtempSync(join(tmpdir(), "music-"));
  mkdirSync(join(dir, "music"));
  return dir;
};

describe("missingMusicFiles", () => {
  it("配乐目录是空的：登记表里的 8 首都缺", () => {
    const dir = emptyPublic();
    expect(missingMusicFiles(pathToFileURL(`${dir}/`))).toEqual(
      Object.keys(MUSIC),
    );
  });

  it("只列出缺的那几首", () => {
    const dir = emptyPublic();
    writeFileSync(join(dir, "music", "kalypo.ogg"), "");
    writeFileSync(join(dir, "music", "ooame.ogg"), "");
    const missing = missingMusicFiles(pathToFileURL(`${dir}/`));
    expect(missing).toHaveLength(6);
    expect(missing).not.toContain("kalypo");
    expect(missing).not.toContain("ooame");
  });
});

describe("missingMusicNote", () => {
  it("写明缺哪几首，指向说明", () => {
    expect(missingMusicNote(["kalypo", "ooame"])).toBe(
      "本机缺配乐文件 kalypo、ooame，跳过要读曲子文件的检查；获取方法见 video/public/music/README.md",
    );
  });
});
