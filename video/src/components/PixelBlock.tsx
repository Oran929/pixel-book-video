import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import { border, COLOR, hardShadow, pixelText, SIZE } from "../style/style";
import type { PixelBlockProps } from "./declarations";

// 样片用的简单组件：一个带字的像素方块。
export const PixelBlock: React.FC<z.infer<typeof PixelBlockProps>> = ({
  label,
}) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
      paddingBottom: SIZE.blockLift,
    }}
  >
    <div
      style={{
        width: SIZE.block,
        height: SIZE.block,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: COLOR.accent,
        border: border(SIZE.strokeThick, COLOR.ink),
        boxShadow: hardShadow(COLOR.ink),
        color: COLOR.onAccent,
        ...pixelText("large"),
      }}
    >
      {label}
    </div>
  </AbsoluteFill>
);
