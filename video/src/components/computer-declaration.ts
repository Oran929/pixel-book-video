import { z } from "zod";
import { layoutGrid } from "../style/grid";
import { FONT_SIZE, SIZE } from "../style/style";
import { textWidth } from "../style/text-width";
import { VIDEO } from "../video-config";
import { declareComponent, displayText, textRoom } from "./declaration";

// 电脑 Computer 的声明、参数格式和尺寸计算（汇总在 declarations.ts）。

/** 电脑占几格：显示器加底座 */
export const COMPUTER_CELLS = [4, 4] as const;

/** 电脑屏幕上的字号和最多几行 */
export const COMPUTER_FONT = "subtitle" as const;
export const COMPUTER_MAX_LINES = 3;

/**
 * 电脑的各部分（相对组件左上角的屏幕像素）：显示器在上，脖子和底座居中在下，
 * 右下留出硬阴影的偏移；屏幕是显示器去掉粗描边和边框
 */
export const computerLayout = () => {
  const grid = layoutGrid(VIDEO.width, VIDEO.height);
  const width = COMPUTER_CELLS[0] * grid.cellWidth - SIZE.shadowOffset;
  const height = COMPUTER_CELLS[1] * grid.cellHeight - SIZE.shadowOffset;
  const monitorHeight = height - SIZE.computerNeckHeight - SIZE.computerBaseHeight;
  const inset = SIZE.strokeThick + SIZE.computerBezel;
  return {
    monitor: { x: 0, y: 0, width, height: monitorHeight },
    screen: {
      x: inset,
      y: inset,
      width: width - 2 * inset,
      height: monitorHeight - 2 * inset,
    },
    neck: {
      x: (width - SIZE.computerNeckWidth) / 2,
      y: monitorHeight,
      width: SIZE.computerNeckWidth,
      height: SIZE.computerNeckHeight,
    },
    base: {
      x: (width - SIZE.computerBaseWidth) / 2,
      y: monitorHeight + SIZE.computerNeckHeight,
      width: SIZE.computerBaseWidth,
      height: SIZE.computerBaseHeight,
    },
  };
};

/** 屏幕上一行字能放多宽：屏幕宽减去两侧内边距（崩溃后字只往下错开，不占横向） */
export const computerLineRoom = (): number =>
  computerLayout().screen.width - 2 * SIZE.blockPadding;

/** 电脑的状态：正常、崩溃 */
export const COMPUTER_STATES = ["normal", "crashed"] as const;
export type ComputerState = (typeof COMPUTER_STATES)[number];

/** Computer：一台老式电脑，屏幕上显示几行字；切到崩溃时抖动、闪屏，停在蓝屏 */
export const ComputerProps = z.strictObject({
  /** 屏幕上的字，一项一行，最多三行，可以不写字（空数组）。显示文字：逐行检查 */
  screen: displayText(
    z
      .array(z.string().min(1))
      .max(COMPUTER_MAX_LINES)
      .superRefine((lines, ctx) => {
        const room = computerLineRoom();
        lines.forEach((line, i) => {
          const width = textWidth(line, FONT_SIZE[COMPUTER_FONT]);
          if (width > room) {
            ctx.addIssue({
              code: "custom",
              path: [i],
              message: `屏幕上的「${line}」估算宽 ${width} 像素，屏幕最多放 ${room} 像素：缩短或拆成两行`,
            });
          }
        });
      }),
  ),
});

export const ComputerDeclaration = declareComponent({
  effect: "一台老式显示器加底座，屏幕上有字，能崩溃成蓝屏也能重启",
  suitedFor: "电脑、程序出错或崩溃：柯克船长的开场（s04-c01）和 s05-c03 前后呼应",
  docs: {
    title: "电脑",
    example: { id: "computer", props: { screen: ["两条", "自相矛盾的知识"] }, at: [7, 1] },
    params: {
      screen: `屏幕上的字，一项一行，可以是空数组（屏幕上没有字）。每行字号 \`${COMPUTER_FONT}\`，最多 ${textRoom(computerLineRoom(), FONT_SIZE[COMPUTER_FONT])}，放不下报错。屏幕上要出现「ERROR」之类的字，也要写进 \`screen\``,
    },
    cells: `${COMPUTER_CELLS[0]} 列 × ${COMPUTER_CELLS[1]} 行。`,
    states: {
      normal: "深色屏幕绿字，最后一行后面一个光标一亮一灭",
      crashed:
        "切过来的 0.8 秒里左右抖动、红白闪屏、冒出花屏横条，之后停在蓝屏，每行字比上一行往下错开一点，横向不动",
    },
    stateNotes: "可以从 `crashed` 切回 `normal`（重启）。",
    nesting: "上面三行格是屏幕（`labelArea`），子组件只能嵌在底座那一行。",
    notes:
      "颜色（`COLOR.computer*`）、尺寸（`SIZE.computer*`）、时长（`MOTION.computerCrashSeconds` 等）都在风格表里；提示牌和电脑增补的颜色在风格样张的「用途色」一节里能看到。",
    sample: "入场、崩溃、重启、退场；三台电脑三种入场和退场动画，最后一台屏幕上没有字。",
  },
  props: ComputerProps,
  states: COMPUTER_STATES,
  cells: () => COMPUTER_CELLS,
  // 上面三行格是屏幕和屏幕上的字，子组件只能嵌在底座那一行
  labelArea: () => ({ at: [0, 0], cells: [COMPUTER_CELLS[0], COMPUTER_CELLS[1] - 1] }),
  enter: "fade",
  // 出现时弹一声，崩溃时爆一声，重启回正常时轻点一声
  sounds: { enter: "pop", states: { normal: "blip", crashed: "crash" } },
});
