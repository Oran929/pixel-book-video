import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import { COLOR, SIZE } from "../style/style";
import { VIDEO } from "../video-config";
import { arrowLine, arrowShape } from "./arrow-geometry";
import type { ArrowProps, ArrowState } from "./declarations";
import type { RenderProps } from "./stage";

// 各状态的箭杆颜色；高亮时黄色的芯外面包一圈深色描边，在纸色底上也看得清
const CORE: Record<ArrowState, string> = {
  normal: COLOR.ink,
  highlight: COLOR.highlight,
};

/**
 * 箭头：从起点组件指向终点组件（两端的矩形由排期给出，见 `arrowLine`）。
 * 铺满整个画面，用 SVG 画一根粗箭杆和一个三角形的箭头头，不抗锯齿，边缘是方的。
 * 入场时箭杆跟着入场进度从起点长到终点（外面再套通用的入场动画）。
 * 状态：`normal` 深色；`highlight` 黄色的芯加深色描边。
 */
export const Arrow: React.FC<RenderProps<z.infer<typeof ArrowProps>>> = ({
  stage,
  ends,
}) => {
  const line = ends ? arrowLine(ends.from, ends.to) : null;
  if (!line) return null;
  const { shaft, head } = arrowShape(line, stage.enter);
  const points = head.map(({ x, y }) => `${x},${y}`).join(" ");
  const highlighted = stage.state === "highlight";
  const layers = [
    ...(highlighted ? [{ color: COLOR.ink, width: SIZE.strokeThick + SIZE.stroke + SIZE.stroke }] : []),
    { color: CORE[stage.state as ArrowState], width: SIZE.strokeThick },
  ];
  return (
    <AbsoluteFill>
      <svg width={VIDEO.width} height={VIDEO.height} shapeRendering="crispEdges">
        {layers.map(({ color, width }, i) => (
          <g key={i}>
            <line
              x1={shaft.from.x}
              y1={shaft.from.y}
              x2={shaft.to.x}
              y2={shaft.to.y}
              stroke={color}
              strokeWidth={width}
            />
            <polygon
              points={points}
              fill={color}
              stroke={color}
              strokeWidth={width - SIZE.strokeThick}
              strokeLinejoin="miter"
            />
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};
