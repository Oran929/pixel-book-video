import { z } from "zod";
import type { ComponentSchemas } from "../episode/storyboard";

// 各组件的参数格式。单独放在不含 JSX、不引用 remotion 的文件里，
// 这样时间轴导出命令（Node 里运行）校验分镜时不用加载 React 组件。
// 组件实现在 registry.ts 里按同样的名字登记。

/** PixelBlock：一个带字的像素方块 */
export const PixelBlockProps = z.strictObject({
  /** 方块上的字，例如 "DRY" */
  label: z.string().min(1),
});

export const COMPONENT_PROPS = {
  PixelBlock: PixelBlockProps,
} as const;

/** 交给 `parseStoryboard` 核对组件名和参数 */
export const COMPONENT_SCHEMAS: ComponentSchemas = COMPONENT_PROPS;
