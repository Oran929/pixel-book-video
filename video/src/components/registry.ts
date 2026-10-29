import type { z } from "zod";
import type { RenderProps } from "./stage";
import { Arrow } from "./Arrow";
import { Mascot } from "./Mascot";
import { PixelBlock } from "./PixelBlock";
import { COMPONENT_DECLARATIONS } from "./declarations";

// 组件注册表：分镜里的组件名 → 组件实现。声明（参数格式、状态、默认动画等）在 declarations.ts 里，
// 新组件两处都登记后，分镜才能引用（少登记一处，类型检查会报错）。
// 常驻组件（resident/ 里的字幕和主题）不在这里登记：Episode 直接放置，不经过分镜。
const COMPONENTS: {
  [Name in keyof typeof COMPONENT_DECLARATIONS]: React.FC<
    RenderProps<z.infer<(typeof COMPONENT_DECLARATIONS)[Name]["props"]>>
  >;
} = {
  PixelBlock,
  Mascot,
  Arrow,
};

/**
 * 分镜里的组件名对应的实现；参数已由 `parseStoryboard` 按 declarations.ts 校验。
 * 组件拿到 `{ props, stage, ends }`（`RenderProps`，见 stage.ts）。
 */
export const componentNamed = (
  name: string,
): React.FC<RenderProps<Record<string, unknown>>> => {
  if (!Object.hasOwn(COMPONENTS, name)) {
    throw new Error(`组件 ${name} 不在组件注册表里`);
  }
  return COMPONENTS[name as keyof typeof COMPONENTS] as React.FC<
    RenderProps<Record<string, unknown>>
  >;
};
