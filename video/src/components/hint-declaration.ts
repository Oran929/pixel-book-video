import { z } from "zod";
import { layoutGrid } from "../style/grid";
import { FONT_SIZE, MOTION, SIZE } from "../style/style";
import { textWidth } from "../style/text-width";
import { VIDEO } from "../video-config";
import { declareComponent, displayText, textRoom } from "./declaration";

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

export const HintSignDeclaration = declareComponent({
  effect: "书里的提示框：橙色标题牌写「提示」和编号，下面是大号的提示标题，入场时闪一下亮起",
  suitedFor: "书里的某条提示（「提示14 ETC」）",
  docs: {
    title: "提示牌",
    example: { id: "tip", props: { label: "提示", number: "14", title: "ETC" }, at: [1, 1] },
    params: {
      label: `标题牌上编号前的字（字号 \`${HINT_FONT.header}\`）。「提示」两个字也由它传入，组件里不写死`,
      number: '提示的编号，字符串，例如 `"14"`；画面说明里写了「提示14」才能用',
      title: `下面的大号提示标题（字号 \`${HINT_FONT.title}\`，单行）`,
    },
    paramNotes: `标题和标题牌最多 ${textRoom(hintTextRoom(), FONT_SIZE[HINT_FONT.title])}，放不下报错。这个宽度是格子宽减去两侧粗描边、硬阴影偏移和两侧内边距，汉字数按大号字算。`,
    cells: `${HINT_CELLS[0]} 列 × ${HINT_CELLS[1]} 行。`,
    states: { normal: "只有这一个状态" },
    animationNotes: `入场默认是它自己的特殊效果 \`light\`（亮起，\`MOTION.hintLightSeconds\` ${MOTION.hintLightSeconds} 秒）：牌子先是暗的（\`COLOR.hintUnlit\`），闪一下、灭掉，从一半起亮住，外面扩出一圈黄光（\`COLOR.hintGlow\`）后消失。退场写 \`animation: "light"\` 时倒着播，即熄灭。`,
    nesting: "整块都是字（`labelArea` 是整块），不能嵌子组件。",
    sample: "亮起、亮着、熄灭；三块提示牌三种入场和退场动画。",
  },
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
