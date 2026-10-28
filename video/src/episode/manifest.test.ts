import { describe, expect, it } from "vitest";
import { parseManifest } from "./manifest";

const VALID = {
  voice_fingerprint: "3f2a9c0d1e4b5a6f",
  segments: [{ id: "s01", title: "开场" }],
  scenes: [{ id: "s01-c01", segment: "s01" }],
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
    [withLine({ seconds: undefined }), "lines[0].seconds"],
    [withLine({ seconds: 0 }), "lines[0].seconds"],
    [withLine({ scene: "s09-c01" }), "lines[0].scene"],
    [
      { ...VALID, scenes: [{ id: "s01-c01", segment: "s09" }] },
      "scenes[0].segment",
    ],
  ])("names the bad field", (data, field) => {
    expect(() => parseManifest(data)).toThrow(field);
  });
});
