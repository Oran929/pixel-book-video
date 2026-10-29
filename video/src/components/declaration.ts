import { z } from "zod";
import type { GridPoint } from "../style/grid";
import { MOTION } from "../style/style";

// 组件声明的格式（ADR-0011）。分镜校验和排期只依赖声明，不依赖组件实现，
// 所以这里不引用 React 和 remotion：时间轴导出命令在 Node 里运行。

/**
 * 入场和退场的通用动画：`fade` 淡入淡出，`slide` 落下或升起，
 * `none` 瞬间出现或消失（不放音效），用来把同一个东西接到下一个画面。
 * 组件自己的特殊效果（比如提示牌的「亮起」）以后作为它的默认动画登记。
 */
export const ANIMATIONS = ["fade", "slide", "none"] as const;
export type Animation = (typeof ANIMATIONS)[number];

/** 动画播多少帧；`none` 是 0 帧 */
export const animationFrames = (animation: Animation, fps: number): number =>
  animation === "none" ? 0 : Math.round(MOTION.animationSeconds * fps);

/** 占几格：[列数, 行数]（网格见 style/grid.ts） */
export type Cells = GridPoint;

export type ComponentDeclaration<Props extends z.ZodType = z.ZodType> = {
  /** 参数格式 */
  props: Props;
  /** 状态清单，第一个是初始状态 */
  states: readonly [string, ...string[]];
  /** 按参数算出占几格 */
  cells(props: z.infer<Props>): Cells;
  /** 分镜的入场触发不写 `animation` 时用的动画 */
  enter: Animation;
  /** 分镜的退场触发不写 `animation` 时用的动画 */
  exit: Animation;
  /** 连线类组件（箭头）：不按格子摆放，按组件 id 指向两端 */
  connector: boolean;
};

/** 组件名 → 声明 */
export type ComponentDeclarations = Readonly<Record<string, ComponentDeclaration>>;

/** 登记一个组件的声明；`cells` 的参数类型从 `props` 推出 */
export const declareComponent = <Props extends z.ZodType>(
  declaration: ComponentDeclaration<Props>,
): ComponentDeclaration<Props> => declaration;

/**
 * 显示文字的登记表：登记在这里的参数格式，值会显示在画面上，
 * 分镜检查要求它出自本画面的画面说明或旁白句（#36，见 README「显示文字」）
 */
export const DISPLAY_TEXT = z.registry<Record<string, never>>();

/**
 * 把组件参数格式里的一项标成显示文字：字符串，或字符串数组（逐项检查）。
 * 只认参数对象的顶层字段（外面可以再套 `.optional()`）。
 */
export const displayText = <Text extends z.ZodString | z.ZodArray<z.ZodString>>(
  schema: Text,
): Text => {
  schema.register(DISPLAY_TEXT, {});
  return schema;
};

/** 参数格式里标成显示文字的顶层字段名 */
export const displayTextFields = (props: z.ZodType): string[] => {
  if (!(props instanceof z.ZodObject)) return [];
  return Object.entries(props.shape as Record<string, z.ZodType>)
    .filter(([, field]) => DISPLAY_TEXT.has(unwrapOptional(field)))
    .map(([key]) => key);
};

/** 去掉 `.optional()` 的外层 */
export const unwrapOptional = (field: z.ZodType): z.ZodType =>
  field instanceof z.ZodOptional ? unwrapOptional(field.unwrap() as z.ZodType) : field;
