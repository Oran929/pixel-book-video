import { describe, expect, it } from "vitest";
import { parseManifest } from "./manifest";

const VALID = {
  voice_fingerprint: "3f2a9c0d1e4b5a6f",
  title: "程序员修炼之道",
  segments: [{ id: "s01", title: "开场" }],
  scenes: [{ id: "s01-c01", segment: "s01", description: "书的封面" }],
  lines: [
    {
      id: "s01-l01",
      scene: "s01-c01",
      text: "今天我们一起读一本书。",
      audio: "episode/s01-l01-02e5a53b.wav",
      seconds: 2.645,
    },
  ],
};

const withLine = (patch: object) => ({
  ...VALID,
  lines: [{ ...VALID.lines[0], ...patch }],
});

describe("parseManifest", () => {
  it("accepts what the voicing pipeline writes", () => {
    expect(parseManifest(VALID)).toEqual(VALID);
  });

  it.each([
    [{ ...VALID, voice_fingerprint: undefined }, "voice_fingerprint"],
    [{ ...VALID, voice_fingerprint: "default" }, "voice_fingerprint"],
    [{ ...VALID, title: undefined }, "title"],
    [{ ...VALID, title: "" }, "title"],
    [withLine({ seconds: undefined }), "lines[0].seconds"],
    [withLine({ seconds: 0 }), "lines[0].seconds"],
    [withLine({ scene: "s09-c01" }), "lines[0].scene"],
    [
      {
        ...VALID,
        scenes: [{ id: "s01-c01", segment: "s09", description: "书的封面" }],
      },
      "scenes[0].segment",
    ],
  ])("names the bad field", (data, field) => {
    expect(() => parseManifest(data)).toThrow(field);
  });

  it("asks to rerun voicing when a scene has no description", () => {
    // 票 #32 之前写的合成清单没有画面说明；重新配音会命中缓存，不用 --revoice
    const old = { ...VALID, scenes: [{ id: "s01-c01", segment: "s01" }] };
    const message = (() => {
      try {
        parseManifest(old);
      } catch (error) {
        return (error as Error).message;
      }
      return "";
    })();
    expect(message).toContain("scenes[0].description");
    expect(message).toContain("重新运行 `pixelbook voice`");
    expect(message).not.toContain("--revoice");
  });

  it("accepts an empty description", () => {
    const blank = {
      ...VALID,
      scenes: [{ id: "s01-c01", segment: "s01", description: "" }],
    };
    expect(parseManifest(blank)).toEqual(blank);
  });
});
