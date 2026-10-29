import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOUND_DIR, SOUNDS } from "./sounds";

// 音效登记表一致性（#37）：登记的每个音效都有 wav 和展开后的 jsfxr 参数，
// wav 是 16 位单声道 PCM、有声音、不削波；目录里没有没登记的 wav
const PUBLIC = new URL("../../public/", import.meta.url);
const DIR = new URL(`${SOUND_DIR}/`, PUBLIC);

/** 读 jsfxr 写出的 wav：44 字节的标准头，后面是 PCM 采样 */
const readWav = (file: URL) => {
  const bytes = readFileSync(file);
  const format = {
    riff: bytes.toString("ascii", 0, 4),
    wave: bytes.toString("ascii", 8, 12),
    audioFormat: bytes.readUInt16LE(20),
    channels: bytes.readUInt16LE(22),
    sampleRate: bytes.readUInt32LE(24),
    bitsPerSample: bytes.readUInt16LE(34),
  };
  const data = bytes.subarray(44);
  let peak = 0;
  for (let i = 0; i + 1 < data.length; i += 2) {
    peak = Math.max(peak, Math.abs(data.readInt16LE(i)));
  }
  return { format, seconds: data.length / 2 / format.sampleRate, peak: peak / 32768 };
};

describe.each(Object.entries(SOUNDS))("音效 %s", (id, file) => {
  const wav = new URL(file, PUBLIC);
  const params = new URL(`${id}.sfxr.json`, DIR);

  it("文件名就是音效 ID，放在音效目录里", () => {
    expect(file).toBe(`${SOUND_DIR}/${id}.wav`);
  });

  it("wav 文件存在", () => {
    expect(existsSync(wav)).toBe(true);
  });

  it("旁边有展开后的 jsfxr 参数（16 位采样）", () => {
    const parsed = JSON.parse(readFileSync(params, "utf8")) as Record<string, unknown>;
    expect(parsed).toMatchObject({ sample_size: 16, sample_rate: 44100 });
    // 展开后的参数：波形和包络都写明，不是预设名
    expect(Object.keys(parsed)).toEqual(
      expect.arrayContaining(["wave_type", "p_env_sustain", "p_env_decay", "p_base_freq", "sound_vol"]),
    );
  });

  it("是 16 位单声道 PCM，短于 1.5 秒，有声音、峰值低于 -1 dBFS", () => {
    const { format, seconds, peak } = readWav(wav);
    expect(format).toEqual({
      riff: "RIFF",
      wave: "WAVE",
      audioFormat: 1,
      channels: 1,
      sampleRate: 44100,
      bitsPerSample: 16,
    });
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThan(1.5);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThan(10 ** (-1 / 20));
  });
});

describe("音效目录", () => {
  it("没有没登记的 wav 或参数文件", () => {
    const registered = Object.keys(SOUNDS).flatMap((id) => [`${id}.wav`, `${id}.sfxr.json`]);
    const extra = readdirSync(DIR).filter(
      (name) => (name.endsWith(".wav") || name.endsWith(".sfxr.json")) && !registered.includes(name),
    );
    expect(extra).toEqual([]);
  });
});
