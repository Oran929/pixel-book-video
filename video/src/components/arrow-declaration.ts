import { z } from "zod";
import { declareConnector } from "./declaration";

// 箭头 Arrow 的声明和参数格式（汇总在 declarations.ts）。

/** 箭头的状态：正常、高亮（「改一处要连带改三处」时点亮连线） */
export const ARROW_STATES = ["normal", "highlight"] as const;
export type ArrowState = (typeof ARROW_STATES)[number];

/** Arrow：从一个组件指向另一个组件；两端写在分镜的 `from`、`to` 上，没有参数 */
export const ArrowProps = z.strictObject({});

export const ArrowDeclaration = declareConnector({
  effect: "一支粗箭头从一个组件长出来，指到另一个组件，可以高亮",
  suitedFor: "指向、依赖、牵连：「指向 ETC」「改一处要连带改三处」",
  docs: {
    title: "箭头",
    example: { id: "dry-etc", props: {}, from: "dry", to: "etc" },
    params: {},
    states: {
      normal: "深色",
      highlight: "黄色的芯加深色描边",
    },
    animationNotes: "入场时箭杆从起点长到终点（按入场进度），外面再套入场动画。",
    notes: [
      "- **时间**：箭头在画面上的区间（从入场帧到退场动画播完，没有退场的到画面结束）必须完全落在两端组件各自的区间里：和端点同一帧入场、同一帧离开画面都合法；早于某一端入场，或某一端已经离开画面时箭头还在，都报错（报出第几个画面、第几个组件、箭头和那一端的帧区间）。端点退场时，箭头要一起退场（同样长的退场动画，或更早）。",
      "- **画法**：沿两端矩形中心的连线，从起点组件的边框外 `SIZE.arrowGap` 出发，尖停在终点组件边框外 `SIZE.arrowGap`；粗箭杆（`SIZE.strokeThick`）加三角形箭头头（`SIZE.arrowHeadLength`、`SIZE.arrowHeadHalfWidth`），坐标取整到像素网格，不抗锯齿。两端挨得太近、放不下箭头头时不画。端点在网格上怎么摆，箭头就怎么斜，所以摆放时两端之间要留出空档，箭杆不要穿过别的组件（这一条没有检查，靠看样帧）。",
      "- 箭头画在组件列表里它的位置上（后写的画在上面），一般写在两端组件后面。",
    ].join("\n"),
    sample: "一个知识块指向另一个，高亮、切回、退场；一个知识块指向三个，三种入场和退场动画。",
  },
  props: ArrowProps,
  states: ARROW_STATES,
  enter: "fade",
  // 出现时弹一声；高亮、切回正常都轻点一声
  sounds: {
    enter: "pop",
    states: { normal: "blip", highlight: "blip" },
  },
});
