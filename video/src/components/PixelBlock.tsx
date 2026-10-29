import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import {
  BLOCK_COLORS,
  border,
  COLOR,
  hardShadow,
  MOTION,
  pixelText,
  SIZE,
  snapToGrid,
} from "../style/style";
import { VIDEO } from "../video-config";
import {
  BLOCK_SIZES,
  type BlockState,
  type PixelBlockProps,
} from "./pixel-block-declaration";
import type { RenderProps } from "./stage";

// 各状态的描边和阴影颜色
const EDGE: Record<BlockState, string> = {
  normal: COLOR.ink,
  highlight: COLOR.highlight,
  changed: COLOR.changed,
};

// 切换状态时跳一下：用一个通用动画的时长跳起再落回（位移取整到像素网格）
const hop = (stateFrames: number) => {
  const t = Math.min(1, stateFrames / (MOTION.animationSeconds * VIDEO.fps));
  return snapToGrid(SIZE.blockHop * Math.sin(Math.PI * t));
};

/**
 * 知识块：一个带字的像素方块，占满分镜给的格子，右下留出硬阴影的偏移。
 * 外框粗描边、内边距 `SIZE.blockPadding`、标签单行居中不换行、不加字距——
 * 和声明里的标签宽度检查（`blockLabelRoom`）同一个口径。
 * 状态：`normal` 深色描边和阴影；`highlight` 描边和阴影变成黄色；`changed` 变成红色
 * （不加文字：组件不显示参数以外的字）。切到 `highlight` 或 `changed` 时跳一下。
 */
export const PixelBlock: React.FC<
  RenderProps<z.infer<typeof PixelBlockProps>>
> = ({ props: { label, size, color }, stage }) => {
  const { fill, text } = BLOCK_COLORS[color];
  const edge = EDGE[stage.state as BlockState];
  // 初始状态从入场算起，不跳；切到别的状态时跳一下
  const lift = stage.state === "normal" ? 0 : hop(stage.stateFrames);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: SIZE.shadowOffset,
          bottom: SIZE.shadowOffset,
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: SIZE.blockPadding,
          backgroundColor: fill,
          border: border(SIZE.strokeThick, edge),
          boxShadow: hardShadow(edge),
          color: text,
          ...pixelText(BLOCK_SIZES[size].font),
          whiteSpace: "nowrap",
          transform: `translateY(${-lift}px)`,
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};
