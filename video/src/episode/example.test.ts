import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planEpisode } from "./episode-plan";

// 范例（#68）examples/books/pragmatic-programmer/ch02/ep01 的分镜：格式、组件参数、摆放都要通过检查。
// 合成清单是产物不提交，用 ep01 摆放试验（#34）的那份，画面和旁白句与范例一致。

const MANIFEST = JSON.parse(
  readFileSync(new URL("fixtures/ep01-episode.json", import.meta.url), "utf8"),
) as unknown;
const STORYBOARD = JSON.parse(
  readFileSync(
    new URL(
      "../../../examples/books/pragmatic-programmer/ch02/ep01/storyboard.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as unknown;

describe("范例", () => {
  it("分镜和组件注册表、合成清单核对通过", () => {
    expect(() => planEpisode(MANIFEST, STORYBOARD)).not.toThrow();
  });
});
