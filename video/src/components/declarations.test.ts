import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ANIMATIONS, type ComponentDeclaration } from "./declaration";
import { COMPONENT_DECLARATIONS } from "./declarations";

// 组件注册表一致性：分镜检查只依赖声明，每个组件的声明都要齐
describe.each(
  Object.entries(COMPONENT_DECLARATIONS) as [string, ComponentDeclaration][],
)("组件 %s 的声明", (_, declared) => {
  it("有参数格式", () => {
    expect(declared.props).toBeInstanceOf(z.ZodType);
  });

  it("有状态清单，状态名不空、不重复", () => {
    expect(declared.states.length).toBeGreaterThan(0);
    expect(declared.states.every((state) => state.length > 0)).toBe(true);
    expect(new Set(declared.states).size).toBe(declared.states.length);
  });

  it("入场和退场的默认动画都是登记过的动画", () => {
    expect(ANIMATIONS).toContain(declared.enter);
    expect(ANIMATIONS).toContain(declared.exit);
  });

  it("声明了占几格和是否是连线类组件", () => {
    expect(typeof declared.cells).toBe("function");
    expect(typeof declared.connector).toBe("boolean");
  });
});

describe("Mascot 组件的参数", () => {
  const schema = COMPONENT_DECLARATIONS.Mascot.props;

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
