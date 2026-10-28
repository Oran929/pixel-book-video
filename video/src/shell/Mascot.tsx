import { AbsoluteFill, Img, staticFile } from "remotion";
import { MASCOT, SIZE } from "../style/style";

/** 频道小人（外壳，占位）：站在画面左下角，整数倍、最近邻插值显示 */
export const Mascot: React.FC = () => (
  <AbsoluteFill>
    <Img
      src={staticFile(MASCOT.file)}
      style={{
        position: "absolute",
        left: SIZE.mascotLeft,
        bottom: 0,
        width: MASCOT.width * MASCOT.scale,
        height: MASCOT.height * MASCOT.scale,
        imageRendering: "pixelated",
      }}
    />
  </AbsoluteFill>
);
