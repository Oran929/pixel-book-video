import { z } from "zod";
import { layoutGrid } from "../style/grid";
import { FONT_SIZE, MOTION, SIZE } from "../style/style";
import { textWidth } from "../style/text-width";
import { VIDEO } from "../video-config";
import { declareComponent, displayText } from "./declaration";

// 提示牌 HintSign 的声明、参数格式和尺寸计算（汇总在 declarations.ts）。

/** 提示牌占几格：一行标题牌（「提示14」）加一行大号标题 */
export const HINT_CELLS = [5, 3] as const;

/** 提示牌的字号：标题牌上的「提示14」用 `HINT_FONT.header`，提示标题用 `HINT_FONT.title` */
export const HINT_FONT = { header: "subtitle", title: "large" } as const;

/**
 * 提示牌里放字的宽度（屏幕像素）：格子宽，减去两侧粗描边、右下的硬阴影和两侧内边距
 * （和知识块同一个口径）
 */
export const hintTextRoom = (): number =>
  HINT_CELLS[0] * layoutGrid(VIDEO.width, VIDEO.height).cellWidth -
  2 * SIZE.strokeThick -
  SIZE.shadowOffset -
  2 * SIZE.blockPadding;

/** HintSign：书里的提示框，标题牌上是「提示」和编号，下面是提示标题；入场默认「亮起」 */
export const HintSignProps = z
  .strictObject({
    /** 标题牌上编号前的字，通常是「提示」。显示文字 */
    label: displayText(z.string().min(1)),
    /** 提示的编号，例如 "14"。显示文字：画面说明里写了「提示14」才能用 */
    number: displayText(z.string().min(1)),
    /** 提示标题，例如 "ETC"；只有一行。显示文字 */
    title: displayText(z.string().min(1)),
  })
  .superRefine(({ label, number, title }, ctx) => {
    const room = hintTextRoom();
    const header =
      textWidth(label, FONT_SIZE[HINT_FONT.header]) +
      SIZE.blockPadding +
      textWidth(number, FONT_SIZE[HINT_FONT.header]);
    if (header > room) {
      ctx.addIssue({
        code: "custom",
        path: ["label"],
        message: `标题牌「${label} ${number}」估算宽 ${header} 像素，提示牌最多放 ${room} 像素`,
      });
    }
    const width = textWidth(title, FONT_SIZE[HINT_FONT.title]);
    if (width > room) {
      ctx.addIssue({
        code: "custom",
        path: ["title"],
        message: `标题「${title}」估算宽 ${width} 像素，提示牌最多放 ${room} 像素：缩短标题`,
      });
    }
  });

/** HintSign 的声明 */
export const HintSignDeclaration = declareComponent({
  props: HintSignProps,
  states: ["normal"],
  cells: () => HINT_CELLS,
  // 整块提示牌都是字，不让子组件嵌进来
  labelArea: () => ({ at: [0, 0], cells: HINT_CELLS }),
  // 亮起：闪两下再亮住；退场写 `light` 时倒着播，即熄灭
  effects: { light: MOTION.hintLightSeconds },
  enter: "light",
  sounds: { enter: "ding", states: { normal: null } },
});
