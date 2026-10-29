import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ANIMATIONS,
  type ComponentDeclaration,
  DISPLAY_TEXT,
  displayTextFields,
  unwrapOptional,
} from "./declaration";
import { COMPONENT_DECLARATIONS } from "./declarations";
import { isSoundId } from "../sound/sounds";

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

  it("每个显示文字参数都是字符串或字符串数组", () => {
    const isString = (schema: z.ZodType) => schema instanceof z.ZodString;
    const wrong = displayTextFields(declared.props).filter((key) => {
      const field = unwrapOptional(
        (declared.props as z.ZodObject).shape[key] as z.ZodType,
      );
      return !(
        isString(field) ||
        (field instanceof z.ZodArray && isString(field.element as z.ZodType))
      );
    });
    expect(wrong).toEqual([]);
  });

  it("每个动作和每个状态都声明了默认音效（或 null），引用的音效都已登记", () => {
    expect(Object.keys(declared.sounds.states).sort()).toEqual(
      [...declared.states].sort(),
    );
    const sounds = [
      declared.sounds.enter,
      declared.sounds.exit,
      ...Object.values(declared.sounds.states),
    ];
    const unregistered = sounds.filter(
      (sound) => sound !== null && !isSoundId(sound),
    );
    expect(unregistered).toEqual([]);
  });

  it("声明了占几格和是否是连线类组件", () => {
    expect(typeof declared.cells).toBe("function");
    expect(typeof declared.connector).toBe("boolean");
  });
});

describe("显示文字参数", () => {
  it("PixelBlock 的 label 是显示文字，Mascot 没有显示文字", () => {
    expect(displayTextFields(COMPONENT_DECLARATIONS.PixelBlock.props)).toEqual(["label"]);
    expect(displayTextFields(COMPONENT_DECLARATIONS.Mascot.props)).toEqual([]);
  });

  it("参数格式里有登记成显示文字、但不是字符串或字符串数组的参数时，一致性检查能发现", () => {
    // 类型上 displayText 只收字符串和字符串数组；绕过类型直接登记一个数字参数
    const props = z.strictObject({ count: z.number() });
    props.shape.count.register(DISPLAY_TEXT, {});
    expect(displayTextFields(props)).toEqual(["count"]);
  });
});

describe("Mascot 组件的参数", () => {
  const schema = COMPONENT_DECLARATIONS.Mascot.props;

  it.each(["dragon", "reader", "whale", "gothic"])(
    "可以选 Q 版角色 %s",
    (character) => {
      expect(schema.safeParse({ character }).success).toBe(true);
    },
  );

  it.each([
    [{ character: "Claude" }, "不认识的角色（不用产品名）"],
    [{}, "缺角色"],
    [{ character: "reader", position: "left" }, "位置改用分镜的 at，不再有 position"],
    [{ character: "reader", scale: 2 }, "多余的参数"],
  ] as [unknown, string][])("不接受 %j（%s）", (props) => {
    expect(schema.safeParse(props).success).toBe(false);
  });
});
