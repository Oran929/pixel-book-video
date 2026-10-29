import { ArrowDeclaration } from "./arrow-declaration";
import { ComputerDeclaration } from "./computer-declaration";
import type { ComponentDeclarations } from "./declaration";
import { ForkDeclaration } from "./fork-declaration";
import { HintSignDeclaration } from "./hint-declaration";
import { MascotDeclaration } from "./mascot-declaration";
import { PixelBlockDeclaration } from "./pixel-block-declaration";
import { TimelineDeclaration } from "./timeline-declaration";

// 各组件的声明汇总在这里；每个组件的声明、参数格式和尺寸计算在各自的 `*-declaration.ts` 里。
// 这些文件不含 JSX、不引用 remotion，这样时间轴导出命令（Node 里运行）校验分镜时
// 不用加载 React 组件。组件实现在 registry.ts 里按同样的名字登记。

/** 组件名 → 声明；交给 `planEpisode` 核对组件名、参数、状态，并取默认动画 */
export const COMPONENT_DECLARATIONS = {
  PixelBlock: PixelBlockDeclaration,
  Mascot: MascotDeclaration,
  Arrow: ArrowDeclaration,
  HintSign: HintSignDeclaration,
  Computer: ComputerDeclaration,
  Fork: ForkDeclaration,
  Timeline: TimelineDeclaration,
} as const satisfies ComponentDeclarations;
