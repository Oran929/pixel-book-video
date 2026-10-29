import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import type { Rect } from "../style/grid";
import { border, COLOR, hardShadow, pixelText, SIZE } from "../style/style";
import { TIMELINE_FONT, type TimelineProps, timelineLayout } from "./timeline-declaration";
import type { RenderProps } from "./stage";
import { timelineLook } from "./timeline-look";

const place = ({ x, y, width, height }: Rect): React.CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width,
  height,
  boxSizing: "border-box",
});

/**
 * 时间线：第一行一条横轴，上面等距排着 `nodes` 个方块节点，第二行是每个节点下面的字。
 * 状态和动画见 `timelineLook`：`lit-N` 时横轴从左往右亮到第 N 个节点，走到的节点变黄、字变深。
 * 节点字的宽度检查（`timelineLabelRoom`）和这里同一个口径。
 */
export const Timeline: React.FC<RenderProps<z.infer<typeof TimelineProps>>> = ({
  props: { nodes },
  stage,
}) => {
  const layout = timelineLayout(nodes.length);
  const look = timelineLook(stage, layout.centers);
  return (
    <AbsoluteFill>
      <div style={{ ...place(layout.axis), backgroundColor: COLOR.timelineAxis }} />
      <div
        style={{
          ...place({ ...layout.axis, width: look.axis }),
          backgroundColor: COLOR.timelineAxisLit,
        }}
      />
      {layout.nodes.map((node, i) => (
        <div
          key={i}
          style={{
            ...place(node),
            backgroundColor: look.lit[i] ? COLOR.timelineNodeLit : COLOR.timelineNode,
            border: border(SIZE.stroke, COLOR.ink),
            boxShadow: hardShadow(COLOR.ink),
          }}
        />
      ))}
      {layout.labels.map((label, i) => (
        <div
          key={i}
          style={{
            ...place(label),
            display: "flex",
            justifyContent: "center",
            color: look.lit[i] ? COLOR.timelineLabelLit : COLOR.timelineLabel,
            ...pixelText(TIMELINE_FONT),
            whiteSpace: "nowrap",
          }}
        >
          {nodes[i]}
        </div>
      ))}
    </AbsoluteFill>
  );
};
