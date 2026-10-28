import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import type { PixelBlockProps } from "./schemas";

// 样片用的简单组件：一个带字的像素方块。
// 颜色和尺寸是临时值，票 09 换成风格表常量。
export const PixelBlock: React.FC<z.infer<typeof PixelBlockProps>> = ({
  label,
}) => (
  <AbsoluteFill
    style={{ justifyContent: "center", alignItems: "center", paddingBottom: 240 }}
  >
    <div
      style={{
        width: 320,
        height: 320,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#e07a3f",
        border: "16px solid #2b2b3a",
        boxShadow: "16px 16px 0 #2b2b3a",
        color: "#f4ecd8",
        fontSize: 96,
        fontWeight: "bold",
      }}
    >
      {label}
    </div>
  </AbsoluteFill>
);
