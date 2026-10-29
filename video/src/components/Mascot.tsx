import { AbsoluteFill, Img, staticFile } from "remotion";
import type { z } from "zod";
import { MASCOTS, SIZE } from "../style/style";
import type { MascotProps } from "./declarations";

// 站位 → 小人在画面底部的水平位置（左右两边离画面边缘 `SIZE.mascotInset`）
const PLACEMENT = {
  left: { justifyContent: "flex-start", paddingLeft: SIZE.mascotInset },
  center: { justifyContent: "center" },
  right: { justifyContent: "flex-end", paddingRight: SIZE.mascotInset },
} as const;

/**
 * Q 版频道小人：站在画面底部的左边、中间或右边。
 * 原尺寸、最近邻插值显示（图不是对齐网格的像素画，缩放会更糊）。暂无动效。
 */
export const Mascot: React.FC<z.infer<typeof MascotProps>> = ({
  character,
  position,
}) => {
  const { file, width, height } = MASCOTS[character];
  return (
    <AbsoluteFill
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        ...PLACEMENT[position],
      }}
    >
      <Img
        src={staticFile(file)}
        style={{ width, height, imageRendering: "pixelated" }}
      />
    </AbsoluteFill>
  );
};
