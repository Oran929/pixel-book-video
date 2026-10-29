// 每个登记的片头的动画组件（#51），ID 和 `intros.ts` 一一对应：少登记一个，类型检查就不过。
// 和登记表分开放，是因为时间轴导出（Node）只读登记表，不引用 React。
import type { IntroId } from "./intros";
import { Intro as LoadPixelBook } from "./load-pixel-book/Intro";

export const INTRO_COMPONENTS: Record<IntroId, React.FC> = {
  "load-pixel-book": LoadPixelBook,
};
