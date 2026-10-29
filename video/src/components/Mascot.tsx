import { AbsoluteFill, Img, staticFile } from "remotion";
import type { z } from "zod";
import { MASCOTS } from "../style/style";
import type { MascotProps } from "./declarations";
import type { RenderProps } from "./stage";

/**
 * Q 版频道小人：站在分镜 `at` 给的格子里，底边对齐、水平居中。
 * 原尺寸、最近邻插值显示（图不是对齐网格的像素画，缩放会更糊）。暂无动效，只有一个状态。
 */
export const Mascot: React.FC<RenderProps<z.infer<typeof MascotProps>>> = ({
  props: { character },
}) => {
  const { file, width, height } = MASCOTS[character];
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <Img
        src={staticFile(file)}
        style={{ width, height, imageRendering: "pixelated" }}
      />
    </AbsoluteFill>
  );
};
