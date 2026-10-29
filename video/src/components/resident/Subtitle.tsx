import { AbsoluteFill } from "remotion";
import { border, COLOR, pixelText, SIZE } from "../../style/style";
import { subtitleDisplayText } from "./subtitle-text";

/**
 * 字幕框（常驻组件）：画面底部居中，像素字体，内外两圈细描边。
 * `text` 是旁白句的原句，显示时去掉分句标点（`subtitleDisplayText`）。
 */
export const Subtitle: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill
    style={{
      justifyContent: "flex-end",
      alignItems: "center",
      padding: SIZE.margin,
    }}
  >
    <div
      style={{
        minWidth: SIZE.subtitleMinWidth,
        padding: `${SIZE.subtitlePaddingY}px ${SIZE.subtitlePaddingX}px`,
        backgroundColor: COLOR.subtitleBox,
        border: border(SIZE.stroke, COLOR.subtitleBorder),
        outline: border(SIZE.stroke, COLOR.subtitleBox),
        color: COLOR.subtitleText,
        ...pixelText("subtitle"),
        textAlign: "center",
      }}
    >
      {subtitleDisplayText(text)}
    </div>
  </AbsoluteFill>
);
