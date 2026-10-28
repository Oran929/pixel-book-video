// 找出组件源码里写死的颜色和尺寸（票 09）：颜色、尺寸只能引用风格表 style.ts。
// 规则从严：去掉注释后，颜色值（#rrggbb、rgb()、hsl()）和 0、1 以外的数字都算写死。

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
// 不在标识符里（q2、x1）的数字，后面可以跟单位（48px）
const NUMBER_LITERAL = /(?<![\w$.#])(?:\d*\.\d+|\d+)/g;
const ALLOWED_NUMBERS = new Set([0, 1]);

/** 注释换成空白，保留换行，行号不变 */
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, "");

export type Hardcoded = { line: number; text: string };

/** 源码里写死颜色或尺寸的行（行号从 1 开始，`text` 是去掉首尾空白的原文） */
export const findHardcodedStyle = (source: string): Hardcoded[] => {
  const original = source.split("\n");
  return stripComments(source)
    .split("\n")
    .flatMap((code, index) => {
      const numbers = (code.match(NUMBER_LITERAL) ?? []).map(Number);
      const hardcoded =
        COLOR_LITERAL.test(code) ||
        numbers.some((value) => !ALLOWED_NUMBERS.has(value));
      return hardcoded
        ? [{ line: index + 1, text: (original[index] ?? "").trim() }]
        : [];
    });
};
