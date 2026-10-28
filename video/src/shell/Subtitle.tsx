import { AbsoluteFill } from "remotion";
import { border, COLOR, pixelText, SIZE } from "../style/style";

/** 字幕框（外壳）：画面底部居中，像素字体，内外两圈细描边 */
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
      {text}
    </div>
  </AbsoluteFill>
);
