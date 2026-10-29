import { z } from "zod";
import { MASCOTS } from "../style/style";
import { type ComponentDeclarations, declareComponent } from "./declaration";

// 各组件的声明（参数格式、状态、占几格、默认动画）。单独放在不含 JSX、
// 不引用 remotion 的文件里，这样时间轴导出命令（Node 里运行）校验分镜时
// 不用加载 React 组件。组件实现在 registry.ts 里按同样的名字登记。

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

/** 组件名 → 声明；交给 `planEpisode` 核对组件名、参数、状态，并取默认动画 */
export const COMPONENT_DECLARATIONS = {
  PixelBlock: declareComponent({
    props: PixelBlockProps,
    states: ["normal"],
    // 占位：知识块的尺寸由 #34、#35 按 `size` 参数算
    cells: () => [2, 2],
    enter: "slide",
    exit: "fade",
    connector: false,
  }),
  Mascot: declareComponent({
    props: MascotProps,
    states: ["normal"],
    // 原尺寸约 400×590 像素，暂按 3 列 × 5 行；小人的尺寸由 #42 决定
    cells: () => [3, 5],
    enter: "fade",
    exit: "fade",
    connector: false,
  }),
} as const satisfies ComponentDeclarations;
