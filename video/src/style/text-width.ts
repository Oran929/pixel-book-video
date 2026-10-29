// 估算像素字体的一行字有多宽（#34），给组件检查字放不放得下。
// 纯 .ts、不引用 React/remotion：分镜校验在 Node 里运行。
import ASCII_ADVANCES from "./ascii-advances.json";
import { FONT } from "./style";

/**
 * 可打印 ASCII（U+0020–U+007E）每个字符的步进宽度，单位是字体像素（字号 ÷ 设计尺寸 12）。
 * 从字体文件的 hmtx 表读出（1200 单位/em，100 单位一个字体像素），
 * tools/tests/test_font_metrics.py 核对它和字体文件一致。
 */
const ADVANCES: Readonly<Record<string, number>> = ASCII_ADVANCES;

/**
 * 一行字在字号 `fontSize` 下的估算宽度（屏幕像素，不含字距）：
 * 拉丁字母、数字和半角符号按字体度量，其余（汉字、全角符号、弯引号）都按 1 个字号宽。
 */
export const textWidth = (text: string, fontSize: number): number => {
  const pixel = fontSize / FONT.designSize;
  return [...text].reduce(
    (width, char) =>
      width +
      (Object.hasOwn(ADVANCES, char) ? ADVANCES[char]! * pixel : fontSize),
    0,
  );
};
