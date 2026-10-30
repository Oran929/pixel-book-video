import { z } from "zod";
import { layoutGrid, type Rect } from "../style/grid";
import { FONT_SIZE, SIZE, snapToGrid } from "../style/style";
import { textWidth } from "../style/text-width";
import { VIDEO } from "../video-config";
import { declareComponent, displayText, textRoom } from "./declaration";

// 岔路 Fork 的声明、参数格式和尺寸计算（汇总在 declarations.ts）。

/** 岔路占几格：左边一段路进路口，往右分出几条路 */
export const FORK_CELLS = [6, 4] as const;

/** 岔路最少、最多几条路 */
export const FORK_ROADS = { min: 2, max: 4 } as const;

/** 岔路标签的字号 */
export const FORK_FONT = "subtitle" as const;

/**
 * 岔路的状态：`normal` 什么都没有；`mark-N` 标出第 N 条路（从上往下数，从 1 起）；
 * `block-N` 在第 N 条路上放路障。一次只处在一个状态：从 `block-N` 切到别的状态就是撤掉路障。
 * 每种情况单独声明一个状态（不用带参数的状态名），分镜照常写 `state`；
 * 路的序号超出这组参数的条数时，`availableStates` 让分镜检查报错。
 */
export const FORK_STATES = [
  "normal",
  "mark-1",
  "mark-2",
  "mark-3",
  "mark-4",
  "block-1",
  "block-2",
  "block-3",
  "block-4",
] as const;
export type ForkState = (typeof FORK_STATES)[number];

/** 岔路状态里的路：`mark-2` → 标出第 2 条路；`normal` → null */
export const forkRoadOf = (
  state: string,
): { kind: "mark" | "block"; road: number } | null => {
  const match = /^(mark|block)-(\d+)$/u.exec(state);
  return match ? { kind: match[1] as "mark" | "block", road: Number(match[2]) } : null;
};

/**
 * 岔路的各部分（相对组件左上角的屏幕像素，都不含描边）：左边一段进路口的路（trunk），
 * 分岔的竖路（spine），往右的几条路（roads，从上往下）；每条路上路障立的位置和标签的位置。
 * 右下留出硬阴影的偏移。
 */
export const forkLayout = (roads: number) => {
  const grid = layoutGrid(VIDEO.width, VIDEO.height);
  const width = FORK_CELLS[0] * grid.cellWidth - SIZE.shadowOffset;
  const height = FORK_CELLS[1] * grid.cellHeight - SIZE.shadowOffset;
  const road = SIZE.forkRoad;
  // 外框描边（细描边，路挨得近）画在路面外面，路面整体往里收一圈描边
  const inset = SIZE.stroke;
  const centers = Array.from({ length: roads }, (_, k) =>
    snapToGrid(inset + ((height - 2 * inset) * (2 * k + 1)) / (2 * roads)),
  );
  const spineX = inset + SIZE.forkTrunk;
  const roadX = spineX + road;
  const right = width - inset;
  const middle = snapToGrid(height / 2);
  const barrierX = roadX + 2 * SIZE.blockPadding;
  const labelX = barrierX + SIZE.forkBarrierWidth + 2 * SIZE.blockPadding;
  return {
    width,
    height,
    trunk: { x: inset, y: middle - road / 2, width: SIZE.forkTrunk + road, height: road },
    spine: {
      x: spineX,
      y: centers[0]! - road / 2,
      width: road,
      height: centers.at(-1)! - centers[0]! + road,
    },
    roads: centers.map((center) => ({
      road: { x: spineX, y: center - road / 2, width: right - spineX, height: road },
      barrier: {
        x: barrierX,
        y: center - road / 2 - SIZE.forkBarrierOverhang,
        width: SIZE.forkBarrierWidth,
        height: road + 2 * SIZE.forkBarrierOverhang,
      },
      label: {
        x: labelX,
        y: center - road / 2,
        width: right - SIZE.blockPadding - labelX,
        height: road,
      },
    })),
  } satisfies Record<string, unknown> & { trunk: Rect; spine: Rect };
};

/** 岔路上一条路的标签能放多宽：路障右边到路的右端（再留一个内边距） */
export const forkLabelRoom = (): number => forkLayout(FORK_ROADS.max).roads[0]!.label.width;

/** Fork：一个路口加几条路；可以标出某条路，可以给某条路放上或撤掉路障 */
export const ForkProps = z
  .strictObject({
    /** 几条路 */
    roads: z.int().min(FORK_ROADS.min).max(FORK_ROADS.max),
    /** 每条路的标签，从上往下一项一条路，项数等于 `roads`；不写就是不带字的路。显示文字：逐项检查 */
    labels: displayText(z.array(z.string().min(1))).optional(),
  })
  .superRefine(({ roads, labels }, ctx) => {
    if (labels === undefined) return;
    if (labels.length !== roads) {
      ctx.addIssue({
        code: "custom",
        path: ["labels"],
        message: `labels 有 ${labels.length} 项，要和 roads（${roads} 条路）一样多`,
      });
    }
    const room = forkLabelRoom();
    labels.forEach((label, i) => {
      const width = textWidth(label, FONT_SIZE[FORK_FONT]);
      if (width > room) {
        ctx.addIssue({
          code: "custom",
          path: ["labels", i],
          message: `路上的标签「${label}」估算宽 ${width} 像素，最多放 ${room} 像素：缩短标签`,
        });
      }
    });
  });

export const ForkDeclaration = declareComponent({
  effect: "一个路口分出几条路，可以把某条路铺成黄色，或在某条路上放下路障",
  suitedFor: "选择、分岔、哪条路好走：ETC 向导站在分岔口、看不出哪条路好改、整块替换时没有路障",
  docs: {
    title: "岔路",
    example: { id: "fork", props: { roads: 3, labels: ["好改", "难改", "看不出"] }, at: [5, 1] },
    params: {
      roads:
        "几条路，从上往下数，第 1 条在最上面：左边一段路进路口，分岔的竖路往右分出这几条路",
      labels: `每条路的标签，项数必须等于 \`roads\`；字号 \`${FORK_FONT}\`，写在路障右边，最多 ${textRoom(forkLabelRoom(), FONT_SIZE[FORK_FONT])}，按 \`forkLabelRoom()\` 算，放不下报错。不写就是不带字的路`,
    },
    cells: `${FORK_CELLS[0]} 列 × ${FORK_CELLS[1]} 行。`,
    states: Object.fromEntries(
      FORK_STATES.map((state) => {
        const road = forkRoadOf(state);
        if (!road) return [state, "什么都没有"];
        return [
          state,
          road.kind === "mark"
            ? `标出第 ${road.road} 条路：路面从路口往右铺成黄色`
            : `在第 ${road.road} 条路上放路障：红白条纹的路障从上方落下`,
        ];
      }),
    ) as Record<ForkState, string>,
    stateNotes:
      "序号不能超过 `roads`（见 `docs/reference/storyboard.md`「带序号的状态」）。一次只处在一个状态：从 `block-N` 切到别的状态就是撤掉路障（路障抬起消失），所以「标出一条路，同时另一条有路障」表现不了，要的话再加状态。动画都用一个通用动画的时长。",
    nesting: "写了 `labels` 时整块都算标签（`labelArea`），不能嵌子组件；不写字时可以嵌。",
    notes:
      "颜色（`COLOR.fork*`）、尺寸（`SIZE.fork*`）在风格表里，风格样张的「用途色」一节能看到。",
    sample: "四条带字的路逐条标出、逐条放路障、撤掉、退场；两条、三条不带字的路三种入场和退场动画。",
  },
  props: ForkProps,
  states: FORK_STATES,
  cells: () => FORK_CELLS,
  // 路上写了字时整块岔路都算标签（字在路的右段，路占满上下）；不写字时子组件可以嵌进来
  labelArea: ({ labels }) =>
    labels ? { at: [0, 0], cells: FORK_CELLS } : { at: [0, 0], cells: [0, 0] },
  availableStates: ({ roads }) =>
    FORK_STATES.filter((state) => (forkRoadOf(state)?.road ?? 0) <= roads),
  enter: "fade",
  // 出现时弹一声；标出一条路轻点一声，路障落下一声，撤掉路障（切回正常）轻点一声
  sounds: {
    enter: "pop",
    states: Object.fromEntries(
      FORK_STATES.map((state) => [
        state,
        forkRoadOf(state)?.kind === "block" ? "drop" : "blip",
      ]),
    ) as Record<ForkState, "drop" | "blip">,
  },
});
