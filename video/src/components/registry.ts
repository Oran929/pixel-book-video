import type { z } from "zod";
import type { ComponentSchemas } from "../episode/storyboard";
import { PixelBlock, PixelBlockProps } from "./PixelBlock";

// 组件注册表：分镜里的组件名 → 参数格式和组件实现。
// 新组件在这里登记后，分镜才能引用。
const entry = <S extends z.ZodType>(
  props: S,
  component: React.FC<z.infer<S>>,
) => ({ props, component });

const COMPONENTS = {
  PixelBlock: entry(PixelBlockProps, PixelBlock),
};

/** 交给 `parseStoryboard` 核对组件名和参数 */
export const COMPONENT_SCHEMAS: ComponentSchemas = Object.fromEntries(
  Object.entries(COMPONENTS).map(([name, { props }]) => [name, props]),
);

/** 分镜里的组件名对应的实现；参数已由 `parseStoryboard` 按 `props` 校验 */
export const componentNamed = (
  name: string,
): React.FC<Record<string, unknown>> => {
  if (!Object.hasOwn(COMPONENTS, name)) {
    throw new Error(`组件 ${name} 不在组件注册表里`);
  }
  return COMPONENTS[name as keyof typeof COMPONENTS]
    .component as React.FC<Record<string, unknown>>;
};
