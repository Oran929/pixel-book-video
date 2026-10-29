import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTROS } from "../intro/intros";
import { OUTROS } from "../outro/outros";
import { PROJECT } from "../project-config";
import { bookendFrames, defineBookendLibrary } from "./library";

const PUBLIC = new URL("../../public/", import.meta.url);

/** 读 wav 头：声道数、采样率、每个采样的位数、采样数（找 fmt 和 data 块） */
const readWav = (file: URL) => {
  const bytes = readFileSync(file);
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  let offset = 12;
  let fmt: { channels: number; sampleRate: number; bits: number } | undefined;
  while (offset < bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      fmt = {
        channels: bytes.readUInt16LE(offset + 10),
        sampleRate: bytes.readUInt32LE(offset + 12),
        bits: bytes.readUInt16LE(offset + 22),
      };
    }
    if (id === "data" && fmt) {
      return { ...fmt, sampleCount: size / (fmt.channels * (fmt.bits / 8)) };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${file.pathname} 里没有 data 块`);
};

describe("defineBookendLibrary", () => {
  const entry = { title: "Demo", frames: 300, audio: "outro/demo.wav" };

  it("帧数不是正整数时报错，写明是片头还是片尾、哪一个", () => {
    expect(() => defineBookendLibrary("outro", { demo: { ...entry, frames: 10.5 } })).toThrow(
      "片尾 demo 的帧数 10.5 不是正整数",
    );
    expect(() => defineBookendLibrary("intro", { demo: { ...entry, frames: 0 } })).toThrow(
      "片头 demo 的帧数 0 不是正整数",
    );
  });

  it("音轨不在对应目录下、文件名不是 ID 时报错", () => {
    expect(() => defineBookendLibrary("intro", { demo: entry })).toThrow(
      "片头 demo 的音轨应为 intro/demo.wav，实际是 outro/demo.wav",
    );
  });

  it("登记得对时原样返回", () => {
    expect(defineBookendLibrary("outro", { demo: entry })).toEqual({ demo: entry });
  });
});

describe("bookendFrames", () => {
  const library = defineBookendLibrary("outro", {
    demo: { title: "Demo", frames: 300, audio: "outro/demo.wav" },
  });

  it("选中的那一个的帧数；「不用」（null）是 0", () => {
    expect(bookendFrames("outro", library, "demo")).toBe(300);
    expect(bookendFrames("outro", library, null)).toBe(0);
  });

  it("没登记的 ID 报错，并列出登记过的", () => {
    expect(() => bookendFrames("outro", library, "nope")).toThrow(
      "片尾 nope 没有登记；登记过的：demo",
    );
  });
});

describe.each([
  ["intro", INTROS],
  ["outro", OUTROS],
] as const)("%s 登记表", (kind, library) => {
  it.each(Object.entries(library))(
    "%s 的音轨在 public 里，44.1 kHz 双声道 16 位，长度正好是登记的帧数",
    (_, bookend) => {
      expect(readWav(new URL(bookend.audio, PUBLIC))).toEqual({
        channels: 2,
        sampleRate: 44100,
        bits: 16,
        sampleCount: bookend.frames * 1470,
      });
    },
  );

  it("public 里没有没登记的音轨", () => {
    expect(readdirSync(new URL(`${kind}/`, PUBLIC)).sort()).toEqual(
      Object.keys(library)
        .map((id) => `${id}.wav`)
        .sort(),
    );
  });
});

describe("用户做的片头片尾", () => {
  it("片头 load-pixel-book 422 帧，片尾 bye-bye 324 帧", () => {
    expect(INTROS["load-pixel-book"].frames).toBe(422);
    expect(OUTROS["bye-bye"].frames).toBe(324);
  });

  it("项目配置选的是它们，都登记过", () => {
    expect(PROJECT).toEqual({ intro: "load-pixel-book", outro: "bye-bye" });
  });
});
