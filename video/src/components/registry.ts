import type { z } from "zod";
import { Mascot } from "./Mascot";
import { PixelBlock } from "./PixelBlock";
import { COMPONENT_PROPS } from "./schemas";

// 组件注册表：分镜里的组件名 → 组件实现。参数格式在 schemas.ts 里，
// 新组件两处都登记后，分镜才能引用（少登记一处，类型检查会报错）。
// 常驻组件（resident/ 里的字幕和主题）不在这里登记：Episode 直接放置，不经过分镜。
const COMPONENTS: {
  [Name in keyof typeof COMPONENT_PROPS]: React.FC<
    z.infer<(typeof COMPONENT_PROPS)[Name]>
  >;
} = {
  PixelBlock,
  Mascot,
};

/** 分镜里的组件名对应的实现；参数已由 `parseStoryboard` 按 schemas.ts 校验 */
export const componentNamed = (
  name: string,
): React.FC<Record<string, unknown>> => {
  if (!Object.hasOwn(COMPONENTS, name)) {
    throw new Error(`组件 ${name} 不在组件注册表里`);
  }
  return COMPONENTS[name as keyof typeof COMPONENTS] as React.FC<
    Record<string, unknown>
  >;
};
