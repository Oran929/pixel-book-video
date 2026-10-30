import { z } from "zod";
import { layoutGrid } from "../style/grid";
import { FONT_SIZE, SIZE, snapToGrid } from "../style/style";
import { textWidth } from "../style/text-width";
import { VIDEO } from "../video-config";
import { declareComponent, displayText, textRoom } from "./declaration";

// 时间线 Timeline 的声明、参数格式和尺寸计算（汇总在 declarations.ts）。

/** 时间线最少、最多几个节点；每个节点占几列 */
export const TIMELINE_NODES = { min: 2, max: 6, columns: 2 } as const;

/** 时间线占几格：每个节点 2 列；上一行是横轴和节点，下一行是节点下面的字 */
export const timelineCells = (nodes: number) =>
  [nodes * TIMELINE_NODES.columns, 2] as const;

/** 时间线节点文字的字号 */
export const TIMELINE_FONT = "subtitle" as const;

/**
 * 时间线的状态：`normal` 一个都没点亮；`lit-N` 点亮了前 N 个节点（从左往右，从 1 起）。
 * 点亮到第 N 个时从上一个状态点亮到的地方沿横轴一路亮过去。
 * 和岔路一样每种情况单独声明一个状态，节点序号超出这组参数的节点数时分镜检查报错。
 */
export const TIMELINE_STATES = [
  "normal",
  "lit-1",
  "lit-2",
  "lit-3",
  "lit-4",
  "lit-5",
  "lit-6",
] as const;
export type TimelineState = (typeof TIMELINE_STATES)[number];

/** 时间线状态点亮了几个节点：`lit-3` → 3，`normal` → 0 */
export const timelineLitOf = (state: string): number => {
  const match = /^lit-(\d+)$/u.exec(state);
  return match ? Number(match[1]) : 0;
};

/**
 * 时间线的各部分（相对组件左上角的屏幕像素）：第一行正中一条横轴，
 * 每个节点在自己那两列的正中；第二行是节点下面的字。
 */
export const timelineLayout = (nodes: number) => {
  const grid = layoutGrid(VIDEO.width, VIDEO.height);
  const [columns] = timelineCells(nodes);
  const width = columns * grid.cellWidth - SIZE.shadowOffset;
  const slot = TIMELINE_NODES.columns * grid.cellWidth;
  const axisY = snapToGrid(grid.cellHeight / 2);
  const node = SIZE.timelineNode;
  const centers = Array.from({ length: nodes }, (_, k) => snapToGrid(k * slot + slot / 2));
  return {
    width,
    axis: { x: 0, y: axisY - SIZE.timelineAxis / 2, width, height: SIZE.timelineAxis },
    centers,
    nodes: centers.map((x) => ({ x: x - node / 2, y: axisY - node / 2, width: node, height: node })),
    labels: centers.map((x) => ({
      x: x - slot / 2 + SIZE.blockPadding,
      y: grid.cellHeight,
      width: slot - 2 * SIZE.blockPadding,
      height: grid.cellHeight - SIZE.shadowOffset,
    })),
  };
};

/** 时间线一个节点下面的字能放多宽：节点那两列，减去两侧内边距 */
export const timelineLabelRoom = (): number => timelineLayout(TIMELINE_NODES.min).labels[0]!.width;

/** Timeline：一条横轴加几个带字的节点，节点可以逐个点亮 */
export const TimelineProps = z.strictObject({
  /** 节点下面的字，从左往右一项一个节点。显示文字：逐项检查 */
  nodes: displayText(
    z
      .array(z.string().min(1))
      .min(TIMELINE_NODES.min)
      .max(TIMELINE_NODES.max)
      .superRefine((nodes, ctx) => {
        const room = timelineLabelRoom();
        nodes.forEach((node, i) => {
          const width = textWidth(node, FONT_SIZE[TIMELINE_FONT]);
          if (width > room) {
            ctx.addIssue({
              code: "custom",
              path: [i],
              message: `节点「${node}」估算宽 ${width} 像素，一个节点最多放 ${room} 像素：缩短`,
            });
          }
        });
      }),
  ),
});

export const TimelineDeclaration = declareComponent({
  effect: "一条横轴加几个带字的节点，节点从左往右逐个点亮",
  suitedFor: "先后顺序、进度：开发时间线、工程日志",
  docs: {
    title: "时间线",
    example: { id: "timeline", props: { nodes: ["起点", "开发过程", "发布"] }, at: [3, 2] },
    params: {
      nodes: `节点下面的字，从左往右一项一个节点。字号 \`${TIMELINE_FONT}\`，每项最多 ${textRoom(timelineLabelRoom(), FONT_SIZE[TIMELINE_FONT])}，按 \`timelineLabelRoom()\` 算，放不下报错`,
    },
    cells: `每个节点 ${TIMELINE_NODES.columns} 列，所以 \`${TIMELINE_NODES.columns} × 节点数\` 列 × 2 行（上一行横轴和节点，下一行字）。`,
    states: Object.fromEntries(
      TIMELINE_STATES.map((state) => {
        const lit = timelineLitOf(state);
        return [state, lit === 0 ? "一个都没点亮" : `点亮了前 ${lit} 个节点`];
      }),
    ) as Record<TimelineState, string>,
    stateNotes:
      "序号不能超过节点数（见 `docs/reference/storyboard.md`「带序号的状态」）。从点亮较少的状态切到 `lit-N` 时，横轴从上次亮到的地方沿着往右亮过去（每多一个节点多 0.4 秒），亮光走到的节点变黄、字变深；熄灭（切到较少的 `lit-N` 或 `normal`）是一下子变的。",
    nesting: "下一行是字（`labelArea`），子组件只能嵌在横轴那一行。",
    notes:
      "颜色（`COLOR.timeline*`）、尺寸（`SIZE.timeline*`）在风格表里，风格样张的「用途色」一节能看到。",
    sample: "六个节点逐个点亮、全部熄灭、一口气点亮、退场；三条两节点的时间线三种入场和退场动画。",
  },
  props: TimelineProps,
  states: TIMELINE_STATES,
  cells: ({ nodes }) => timelineCells(nodes.length),
  // 下一行是节点下面的字，子组件只能嵌在横轴那一行
  labelArea: ({ nodes }) => ({ at: [0, 1], cells: [timelineCells(nodes.length)[0], 1] }),
  availableStates: ({ nodes }) =>
    TIMELINE_STATES.filter((state) => timelineLitOf(state) <= nodes.length),
  enter: "fade",
  // 出现时弹一声，点亮时叮一声；全部熄灭（切回正常）不放音效
  sounds: {
    enter: "pop",
    states: Object.fromEntries(
      TIMELINE_STATES.map((state) => [state, state === "normal" ? null : "ding"]),
    ) as Record<TimelineState, "ding" | null>,
  },
});
