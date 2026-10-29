import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import type { Rect } from "../style/grid";
import { border, COLOR, hardShadow, pixelText, SIZE, snapToGrid } from "../style/style";
import { FORK_FONT, type ForkProps, forkLayout } from "./declarations";
import { barrierStripes, dashes, forkLook, grow, roadDashes, shift } from "./fork-look";
import type { RenderProps } from "./stage";

const place = ({ x, y, width, height }: Rect): React.CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width,
  height,
  boxSizing: "border-box",
});

/**
 * 岔路：左边一段路进路口，分岔的竖路往右分出 `roads` 条路，路上可以写标签（`labels`）。
 * 几段路连成一体：整体一圈描边、右下硬阴影，路面中间一条虚线。
 * 状态和动画见 `forkLook`：`mark-N` 第 N 条路铺成黄色，`block-N` 路障落到第 N 条路上，
 * 切走时路障抬起消失。标签的位置和宽度检查（`forkLabelRoom`）同一个口径。
 */
export const Fork: React.FC<RenderProps<z.infer<typeof ForkProps>>> = ({
  props: { roads, labels },
  stage,
}) => {
  const layout = forkLayout(roads);
  const looks = forkLook(stage, roads);
  const pieces = [layout.trunk, layout.spine, ...layout.roads.map((r) => r.road)];
  const roadStart = layout.spine.x + layout.spine.width;
  return (
    <AbsoluteFill>
      {pieces.map((piece, i) => (
        <div
          key={i}
          style={{
            ...place(shift(grow(piece, SIZE.stroke), SIZE.shadowOffset)),
            backgroundColor: COLOR.ink,
          }}
        />
      ))}
      {pieces.map((piece, i) => (
        <div
          key={i}
          style={{ ...place(grow(piece, SIZE.stroke)), backgroundColor: COLOR.ink }}
        />
      ))}
      {pieces.map((piece, i) => (
        <div key={i} style={{ ...place(piece), backgroundColor: COLOR.forkRoad }} />
      ))}
      <div
        style={{
          ...place(dashes(layout.trunk, layout.trunk.x, layout.spine.x)),
          backgroundImage: roadDashes(),
        }}
      />
      {layout.roads.map(({ road, barrier, label }, i) => {
        const look = looks[i]!;
        const text = labels?.[i];
        const end = text ? label.x : road.x + road.width;
        return (
          <div key={i}>
            <div
              style={{
                ...place({ ...road, width: snapToGrid(road.width * look.marked) }),
                backgroundColor: COLOR.forkMarked,
              }}
            />
            <div style={{ ...place(dashes(road, roadStart, end)), backgroundImage: roadDashes() }} />
            {text ? (
              <div
                style={{
                  ...place(label),
                  display: "flex",
                  alignItems: "center",
                  color: COLOR.forkLabel,
                  ...pixelText(FORK_FONT),
                  whiteSpace: "nowrap",
                }}
              >
                {text}
              </div>
            ) : null}
            {look.barrier ? (
              <div
                style={{
                  ...place(barrier),
                  backgroundImage: barrierStripes(),
                  border: border(SIZE.stroke, COLOR.ink),
                  boxShadow: hardShadow(COLOR.ink),
                  transform: `translateY(${-look.barrier.lift}px)`,
                }}
              />
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
