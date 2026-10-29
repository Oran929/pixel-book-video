import { AbsoluteFill, Img, staticFile } from "remotion";
import type { z } from "zod";
import type { Rect } from "../style/grid";
import { COLOR, MASCOTS } from "../style/style";
import type { MascotProps } from "./declarations";
import { type MascotSymbol, mascotPlacement, symbolDots, symbolLook } from "./mascot-look";
import type { RenderProps } from "./stage";

const place = ({ x, y, width, height }: Rect): React.CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width,
  height,
});

const SYMBOL_COLOR: Record<MascotSymbol, string> = {
  question: COLOR.mascotQuestion,
  exclaim: COLOR.mascotExclaim,
};

/** 头顶的符号：点阵，每个点一个方块，外面一圈 `ink` 描边 */
const HeadSymbol: React.FC<{ symbol: MascotSymbol; at: Rect; offset: number; opacity: number }> = ({
  symbol,
  at,
  offset,
  opacity,
}) => {
  const dots = symbolDots(symbol);
  return (
    <div style={{ ...place(at), opacity, transform: `translateY(${offset}px)` }}>
      <AbsoluteFill>
        {dots.map(({ outline }, i) => (
          <div key={i} style={{ ...place(outline), backgroundColor: COLOR.ink }} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill>
        {dots.map(({ dot }, i) => (
          <div key={i} style={{ ...place(dot), backgroundColor: SYMBOL_COLOR[symbol] }} />
        ))}
      </AbsoluteFill>
    </div>
  );
};

/**
 * Q 版频道小人，一个或一群（`mascotPlacement`）：每人站在自己那块格子里，底边对齐、水平居中，
 * 显示成原图的 1/2，最近邻插值（图不是对齐网格的像素画，用户看过 1/2 的样帧认可，#42）。
 * 状态 `question`、`exclaim` 时每人头顶冒同一个符号（`symbolLook`），切回 `normal` 时淡出。
 */
export const Mascot: React.FC<RenderProps<z.infer<typeof MascotProps>>> = ({ props, stage }) => {
  const look = symbolLook(stage);
  return (
    <AbsoluteFill>
      {mascotPlacement(props).map((member, i) => (
        <div key={i}>
          <Img
            src={staticFile(MASCOTS[member.character].file)}
            style={{ ...place(member.image), imageRendering: "pixelated" }}
          />
          {look ? <HeadSymbol at={member.symbol} {...look} /> : null}
        </div>
      ))}
    </AbsoluteFill>
  );
};
