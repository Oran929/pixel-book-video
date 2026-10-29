import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defineMusicLibrary, MUSIC, MUSIC_DIR, samplesPerFrame } from "./tracks";

const PUBLIC = new URL("../../public/", import.meta.url);

/**
 * 读 OGG/Vorbis 文件：逐页走过去，采样率和声道数取自第一页的 Vorbis 标识头，
 * 采样数取最后一页的 granule position（oggenc 从 0 开始数，就是解码出的采样数）
 */
const readOggVorbis = (file: URL) => {
  const bytes = readFileSync(file);
  let offset = 0;
  let granule = 0n;
  let first: Buffer | undefined;
  while (offset < bytes.length) {
    expect(bytes.toString("ascii", offset, offset + 4)).toBe("OggS");
    const segments = bytes[offset + 26]!;
    let body = 0;
    for (let i = 0; i < segments; i++) body += bytes[offset + 27 + i]!;
    const start = offset + 27 + segments;
    first ??= bytes.subarray(start, start + body);
    granule = bytes.readBigInt64LE(offset + 6);
    offset = start + body;
  }
  if (!first) throw new Error(`${file.pathname} 是空文件`);
  return {
    codec: first.toString("ascii", 0, 7),
    channels: first[11],
    sampleRate: first.readUInt32LE(12),
    sampleCount: Number(granule),
  };
};

const entry = {
  file: "music/demo.ogg",
  title: "Demo",
  author: "Someone",
  source: "https://opengameart.org/content/demo",
  license: "CC0",
  checkedOn: "2026-10-29",
  sampleRate: 44100,
  sampleCount: 1470 * 100,
} as const;

describe("defineMusicLibrary", () => {
  it("收 CC0 和 CC-BY（CC-BY 写了署名）", () => {
    expect(() =>
      defineMusicLibrary({
        a: entry,
        b: { ...entry, license: "CC-BY 4.0", credit: "Demo by Someone" },
        c: { ...entry, license: "CC-BY 3.0", credit: "Demo by Someone" },
      }),
    ).not.toThrow();
  });

  it("其他许可报错，写明曲子 ID 和许可", () => {
    expect(() => defineMusicLibrary({ demo: { ...entry, license: "CC-BY-SA 4.0" } })).toThrow(
      "配乐 demo 的许可是 CC-BY-SA 4.0，配乐库只收 CC0 和 CC-BY",
    );
    expect(() => defineMusicLibrary({ demo: { ...entry, license: "OGA-BY 3.0" } })).toThrow(
      "配乐 demo 的许可是 OGA-BY 3.0，配乐库只收 CC0 和 CC-BY",
    );
  });

  it("CC-BY 缺署名报错", () => {
    expect(() => defineMusicLibrary({ demo: { ...entry, license: "CC-BY 4.0" } })).toThrow(
      "配乐 demo 的许可是 CC-BY 4.0，要写署名 credit",
    );
    expect(() =>
      defineMusicLibrary({ demo: { ...entry, license: "CC-BY 4.0", credit: "  " } }),
    ).toThrow("配乐 demo 的许可是 CC-BY 4.0，要写署名 credit");
  });

  it("采样数不是一帧采样数的整数倍时报错（30fps：44.1kHz 一帧 1470 个，48kHz 一帧 1600 个）", () => {
    expect(() => defineMusicLibrary({ demo: { ...entry, sampleCount: 1470 * 100 + 1 } })).toThrow(
      "配乐 demo 的采样数 147001 不是一帧 1470 个采样的整数倍",
    );
    expect(() =>
      defineMusicLibrary({ demo: { ...entry, sampleRate: 48000, sampleCount: 1470 * 100 } }),
    ).toThrow("配乐 demo 的采样数 147000 不是一帧 1600 个采样的整数倍");
    expect(() =>
      defineMusicLibrary({ demo: { ...entry, sampleRate: 48000, sampleCount: 1600 * 3 } }),
    ).not.toThrow();
  });

  it("采样率不能整除成整数个采样一帧时报错", () => {
    expect(() => defineMusicLibrary({ demo: { ...entry, sampleRate: 32000 } })).toThrow(
      "配乐 demo 的采样率 32000 Hz 在 30fps 下一帧不是整数个采样",
    );
  });
});

describe.each(Object.entries(MUSIC))("配乐 %s", (id, track) => {
  const file = new URL(track.file, PUBLIC);

  it("文件名就是曲子 ID，放在配乐目录里，是 .ogg", () => {
    expect(track.file).toBe(`${MUSIC_DIR}/${id}.ogg`);
  });

  it("文件存在", () => {
    expect(existsSync(file)).toBe(true);
  });

  it("记了核对日期和作品页", () => {
    expect(track.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(track.source).toMatch(/^https:\/\/opengameart\.org\/content\//);
  });

  it("文件是 OGG/Vorbis，采样率和采样数与登记表一致，采样数是一帧采样数的整数倍", () => {
    const ogg = readOggVorbis(file);
    expect(ogg.codec).toBe("\u0001vorbis");
    expect(ogg.sampleRate).toBe(track.sampleRate);
    expect(ogg.sampleCount).toBe(track.sampleCount);
    expect(ogg.sampleCount % samplesPerFrame(ogg.sampleRate)).toBe(0);
  });
});

describe("配乐目录", () => {
  it("没有没登记的文件", () => {
    const registered = Object.values(MUSIC).map((track) => track.file.slice(MUSIC_DIR.length + 1));
    expect(readdirSync(new URL(`${MUSIC_DIR}/`, PUBLIC)).filter((name) => !registered.includes(name))).toEqual([]);
  });

  it("8 首曲子（#52 的新库）", () => {
    expect(Object.keys(MUSIC)).toHaveLength(8);
  });
});
