import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import type { Rect } from "../style/grid";
import { border, COLOR, hardShadow, pixelText, SIZE, snapToGrid } from "../style/style";
import { computerLook, lineOffset } from "./computer-look";
import { COMPUTER_FONT, type ComputerProps, computerLayout } from "./declarations";
import type { RenderProps } from "./stage";

const LAYOUT = computerLayout();

const place = ({ x, y, width, height }: Rect): React.CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width,
  height,
  boxSizing: "border-box",
});

// 显示器的外框、脖子和底座：外壳色，粗描边，右下硬阴影
const shell = (rect: Rect): React.CSSProperties => ({
  ...place(rect),
  backgroundColor: COLOR.computerCase,
  border: border(SIZE.strokeThick, COLOR.ink),
  boxShadow: hardShadow(COLOR.ink),
});

/**
 * 电脑：一台老式显示器加底座，屏幕上一行一行显示 `screen` 里的字（可以没有字）。
 * 状态和动画见 `computerLook`：正常时绿字加闪烁的光标；切到崩溃时抖动、闪屏、花屏，停在蓝屏，
 * 字往下错开。屏幕宽度和每行字的宽度检查（`computerLineRoom`）同一个口径。
 */
export const Computer: React.FC<RenderProps<z.infer<typeof ComputerProps>>> = ({
  props: { screen },
  stage,
}) => {
  const look = computerLook(stage);
  const { screen: area } = LAYOUT;
  return (
    <AbsoluteFill style={{ transform: `translateX(${look.shake}px)` }}>
      <div style={shell(LAYOUT.base)} />
      <div style={shell(LAYOUT.neck)} />
      <div style={shell(LAYOUT.monitor)} />
      <div
        style={{
          ...place(area),
          overflow: "hidden",
          backgroundColor: look.screen,
          border: border(SIZE.stroke, COLOR.ink),
          padding: SIZE.blockPadding,
          color: look.text,
          ...pixelText(COMPUTER_FONT),
          whiteSpace: "nowrap",
        }}
      >
        {screen.map((line, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              transform: `translate(${lineOffset(look, i).x}px, ${lineOffset(look, i).y}px)`,
            }}
          >
            <span>{line}</span>
            {look.cursor && i === screen.length - 1 ? (
              <span
                style={{
                  width: SIZE.computerCursorWidth,
                  height: SIZE.computerCursorHeight,
                  marginLeft: SIZE.stroke,
                  backgroundColor: look.text,
                }}
              />
            ) : null}
          </div>
        ))}
        {screen.length === 0 && look.cursor ? (
          <div
            style={{
              width: SIZE.computerCursorWidth,
              height: SIZE.computerCursorHeight,
              backgroundColor: look.text,
            }}
          />
        ) : null}
        {look.glitch.map((top, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: snapToGrid(top * area.height),
              height: SIZE.computerGlitchBar,
              backgroundColor: look.text,
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
