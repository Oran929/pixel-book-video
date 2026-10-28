import { expect, it } from "vitest";
import { VIDEO } from "./video-config";

it("renders 16:9 at 1920x1080", () => {
  expect(VIDEO.width).toBe(1920);
  expect(VIDEO.height).toBe(1080);
});
