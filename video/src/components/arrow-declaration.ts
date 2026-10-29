import { z } from "zod";
import { declareConnector } from "./declaration";

// 箭头 Arrow 的声明和参数格式（汇总在 declarations.ts）。

/** 箭头的状态：正常、高亮（「改一处要连带改三处」时点亮连线） */
export const ARROW_STATES = ["normal", "highlight"] as const;
export type ArrowState = (typeof ARROW_STATES)[number];

/** Arrow：从一个组件指向另一个组件；两端写在分镜的 `from`、`to` 上，没有参数 */
export const ArrowProps = z.strictObject({});

/** Arrow 的声明 */
export const ArrowDeclaration = declareConnector({
  props: ArrowProps,
  states: ARROW_STATES,
  enter: "fade",
  // 出现时弹一声；高亮、切回正常都轻点一声
  sounds: {
    enter: "pop",
    states: { normal: "blip", highlight: "blip" },
  },
});
