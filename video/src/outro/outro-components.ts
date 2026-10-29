// 每个登记的片尾的动画组件（#51），ID 和 `outros.ts` 一一对应：少登记一个，类型检查就不过。
// 和登记表分开放，是因为时间轴导出（Node）只读登记表，不引用 React。
import type { OutroId } from "./outros";
import { Outro as ByeBye } from "./bye-bye/Outro";

export const OUTRO_COMPONENTS: Record<OutroId, React.FC> = {
  "bye-bye": ByeBye,
};
