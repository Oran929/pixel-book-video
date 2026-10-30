import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ANIMATIONS,
  animationsOf,
  type ComponentDeclaration,
  declareComponent,
  declareConnector,
  DISPLAY_TEXT,
  displayTextFields,
  isConnector,
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

  it("入场和退场的默认动画是通用动画或自己登记的特殊效果", () => {
    expect(animationsOf(declared)).toContain(declared.enter);
    expect(animationsOf(declared)).toContain(declared.exit);
  });

  it("自己的特殊效果不和通用动画重名，时长是正的秒数", () => {
    Object.entries(declared.effects ?? {}).forEach(([name, seconds]) => {
      expect(ANIMATIONS).not.toContain(name);
      expect(seconds).toBeGreaterThan(0);
    });
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
    // 连线类组件不按格子摆放，不声明占几格
    expect(typeof declared.connector).toBe("boolean");
    expect(typeof Reflect.get(declared, "cells")).toBe(
      isConnector(declared) ? "undefined" : "function",
    );
  });
});

describe("知识块的标签位置（嵌套时子组件要让开）", () => {
  const { PixelBlock } = COMPONENT_DECLARATIONS;
  it.each([
    ["small", { at: [0, 0], cells: [2, 1] }],
    ["medium", { at: [0, 0], cells: [3, 2] }],
    ["large", { at: [0, 1], cells: [4, 1] }],
  ] as const)("size %s 的标签占 %j，落在方块自己的格子里", (size, area) => {
    const props = PixelBlock.props.parse({ label: "知识", size, color: "orange" });
    const label = PixelBlock.labelArea!(props);
    const [columns, rows] = PixelBlock.cells(props);
    expect(label).toEqual(area);
    expect(label.at[0] + label.cells[0]).toBeLessThanOrEqual(columns);
    expect(label.at[1] + label.cells[1]).toBeLessThanOrEqual(rows);
  });
});

describe("显示文字参数", () => {
  it("PixelBlock 的 label 是显示文字，Mascot 没有显示文字", () => {
    expect(displayTextFields(COMPONENT_DECLARATIONS.PixelBlock.props)).toEqual(["label"]);
    expect(displayTextFields(COMPONENT_DECLARATIONS.Mascot.props)).toEqual([]);
  });

  it("提示牌的「提示」、编号、标题和电脑屏幕上的字都是显示文字", () => {
    expect(displayTextFields(COMPONENT_DECLARATIONS.HintSign.props)).toEqual([
      "label",
      "number",
      "title",
    ]);
    expect(displayTextFields(COMPONENT_DECLARATIONS.Computer.props)).toEqual(["screen"]);
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

describe("组件目录的两个必填说明字段", () => {
  const base = {
    props: z.strictObject({}),
    states: ["normal"] as const,
    enter: "fade" as const,
    sounds: { enter: null, states: { normal: null } },
  };

  it.each(Object.keys(COMPONENT_DECLARATIONS))("%s 写了效果和适合表达", (name) => {
    const declared = COMPONENT_DECLARATIONS[name as keyof typeof COMPONENT_DECLARATIONS];
    expect(declared.effect.length).toBeGreaterThan(0);
    expect(declared.suitedFor.length).toBeGreaterThan(0);
  });

  it.each([
    [{ suitedFor: "概念" }, "效果"],
    [{ effect: "一个方块", suitedFor: " " }, "适合表达"],
  ])("按格子摆放的组件缺字段 %j 时报错，写明缺「%s」", (fields, missing) => {
    // 绕过类型检查，模拟忘了写
    const input = { ...base, ...fields, cells: () => [1, 1] } as unknown as Parameters<
      typeof declareComponent
    >[0];
    expect(() => declareComponent(input)).toThrow(missing);
  });

  it("连线类组件缺字段时也报错", () => {
    const input = { ...base, effect: "一条线" } as unknown as Parameters<
      typeof declareConnector
    >[0];
    expect(() => declareConnector(input)).toThrow("适合表达");
  });
});
