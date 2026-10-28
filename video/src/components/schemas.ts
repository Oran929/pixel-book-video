import { z } from "zod";
import type { ComponentSchemas } from "../episode/storyboard";
import { MASCOTS } from "../style/style";

// 各组件的参数格式。单独放在不含 JSX、不引用 remotion 的文件里，
// 这样时间轴导出命令（Node 里运行）校验分镜时不用加载 React 组件。
// 组件实现在 registry.ts 里按同样的名字登记。

/** PixelBlock：一个带字的像素方块 */
export const PixelBlockProps = z.strictObject({
  /** 方块上的字，例如 "DRY" */
  label: z.string().min(1),
});

/** Mascot：一个 Q 版频道小人站在画面底部，分镜里需要"人物做什么"时才用 */
export const MascotProps = z.strictObject({
  /** 哪个 Q 版角色，按外观起名（见风格表 `MASCOTS`） */
  character: z.enum(
    Object.keys(MASCOTS) as [keyof typeof MASCOTS, ...(keyof typeof MASCOTS)[]],
  ),
  /** 站在画面底部的左边、中间还是右边 */
  position: z.enum(["left", "center", "right"]),
});

export const COMPONENT_PROPS = {
  PixelBlock: PixelBlockProps,
  Mascot: MascotProps,
} as const;

/** 交给 `parseStoryboard` 核对组件名和参数 */
export const COMPONENT_SCHEMAS: ComponentSchemas = COMPONENT_PROPS;
