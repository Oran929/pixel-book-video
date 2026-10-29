import { z } from "zod";
import type { Sound } from "../sound/sounds";
import type { GridPoint } from "../style/grid";
import { MOTION } from "../style/style";

// 组件声明的格式（ADR-0011）。分镜校验和排期只依赖声明，不依赖组件实现，
// 所以这里不引用 React 和 remotion：时间轴导出命令在 Node 里运行。

/**
 * 入场和退场的通用动画：`fade` 淡入淡出，`slide` 落下或升起，
 * `none` 瞬间出现或消失（不放音效），用来把同一个东西接到下一个画面。
 * 组件自己的特殊效果（比如提示牌的「亮起」）登记在声明的 `effects` 里，只有这个组件能用。
 */
export const ANIMATIONS = ["fade", "slide", "none"] as const;
export type GenericAnimation = (typeof ANIMATIONS)[number];

/** 入场或退场的动画名：通用动画，或组件自己登记的特殊效果名 */
export type Animation = string;

/** 组件自己的特殊效果：效果名 → 播多少秒（从风格表 `MOTION` 取） */
export type Effects = Readonly<Record<string, number>>;

/** 组件能用的入场和退场动画：通用动画加它自己的特殊效果 */
export const animationsOf = (declaration: { effects?: Effects }): string[] => [
  ...ANIMATIONS,
  ...Object.keys(declaration.effects ?? {}),
];

/**
 * 动画播多少帧：`none` 是 0 帧，`fade`、`slide` 是通用时长，
 * 特殊效果按组件声明 `effects` 里登记的秒数
 */
export const animationFrames = (
  animation: Animation,
  fps: number,
  effects: Effects = {},
): number => {
  if (animation === "none") return 0;
  const seconds = Object.hasOwn(effects, animation)
    ? effects[animation]!
    : MOTION.animationSeconds;
  return Math.round(seconds * fps);
};

/** 占几格：[列数, 行数]（网格见 style/grid.ts） */
export type Cells = GridPoint;

/**
 * 默认音效：每个动作、每个状态各一个音效 ID，或 null（不放音效）。
 * 入场时组件处在初始状态，只响 `enter`，不响初始状态的音效；之后切回初始状态时才响它。
 */
export type ComponentSounds<State extends string = string> = {
  enter: Sound;
  exit: Sound;
  states: Record<State, Sound>;
};

export type ComponentDeclaration<
  Props extends z.ZodType = z.ZodType,
  State extends string = string,
  Effect extends string = string,
> = {
  /** 参数格式 */
  props: Props;
  /** 状态清单，第一个是初始状态 */
  states: readonly [State, ...State[]];
  /** 按参数算出占几格 */
  cells(props: z.infer<Props>): Cells;
  /**
   * 组件自己的入场、退场特殊效果：效果名 → 播多少秒。分镜的 `animation` 可以写这些名字，
   * 退场动画是否在画面结束前播完也按这里的时长算。不写表示只有通用动画。
   */
  effects?: Readonly<Record<Effect, number>>;
  /** 分镜的入场触发不写 `animation` 时用的动画：通用动画或自己的特殊效果 */
  enter: GenericAnimation | NoInfer<Effect>;
  /** 分镜的退场触发不写 `animation` 时用的动画：通用动画或自己的特殊效果 */
  exit: GenericAnimation | NoInfer<Effect>;
  /** 连线类组件（箭头）：不按格子摆放，按组件 id 指向两端 */
  connector: boolean;
  /** 默认音效；分镜的触发可以用 `sound` 关掉或替换 */
  sounds: ComponentSounds<State>;
  /**
   * 标签占的格（相对组件自己的左上角）：嵌在里面的子组件不能压住这些格。
   * 不写表示没有要让开的字，子组件可以放在任何格子里。
   */
  labelArea?(props: z.infer<Props>): { at: Cells; cells: Cells };
};

/** 组件名 → 声明 */
export type ComponentDeclarations = Readonly<Record<string, ComponentDeclaration>>;

/**
 * 登记一个组件的声明；`cells` 的参数类型从 `props` 推出，
 * `sounds.states` 必须为 `states` 里的每个状态都写一项（少写类型检查会报错）
 */
export const declareComponent = <
  Props extends z.ZodType,
  const State extends string,
  const Effect extends string = never,
>(
  declaration: ComponentDeclaration<Props, State, Effect>,
): ComponentDeclaration<Props, State, Effect> => declaration;

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
