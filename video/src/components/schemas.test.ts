import { describe, expect, it } from "vitest";
import { COMPONENT_PROPS } from "./schemas";

describe("Mascot 组件的参数", () => {
  const schema = COMPONENT_PROPS.Mascot;

  it.each(["dragon", "reader", "whale", "gothic"])(
    "可以选 Q 版角色 %s",
    (character) => {
      expect(schema.safeParse({ character, position: "left" }).success).toBe(
        true,
      );
    },
  );

  it.each(["left", "center", "right"])("可以站在 %s", (position) => {
    expect(schema.safeParse({ character: "reader", position }).success).toBe(
      true,
    );
  });

  it.each([
    [{ character: "Claude", position: "left" }, "不认识的角色（不用产品名）"],
    [{ character: "reader", position: "top" }, "不认识的位置"],
    [{ character: "reader" }, "缺位置"],
    [{ position: "left" }, "缺角色"],
    [{ character: "reader", position: "left", scale: 2 }, "多余的参数"],
  ] as [unknown, string][])("不接受 %j（%s）", (props) => {
    expect(schema.safeParse(props).success).toBe(false);
  });
});
