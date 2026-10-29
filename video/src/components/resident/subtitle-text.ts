// 字幕显示的文字（票 09）：只改画面上的字幕，配音、语音识别核对和合成清单仍用原句。

/** 字幕里去掉的分句标点：逗号、句号、顿号、分号 */
const DROPPED = /[，。、；]/g;

/** 右侧的引号、书名号、括号：前面紧挨着的分句标点直接去掉，不换成空格 */
const SPACE_BEFORE_CLOSING = / +(?=[”’》）])/g;

/**
 * 去掉 `，。、；`：句中的换成一个空格，句末（以及句首）的直接去掉；
 * 不会出现连续两个空格。`：“”‘’《》（）——？！` 保留。
 */
export const subtitleDisplayText = (text: string) =>
  text
    .replace(DROPPED, " ")
    .replace(/ {2,}/g, " ")
    .replace(SPACE_BEFORE_CLOSING, "")
    .trim();
