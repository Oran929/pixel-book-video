import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import { border, COLOR, hardShadow, pixelText, SIZE } from "../style/style";
import { HINT_FONT, type HintSignProps } from "./declarations";
import { hintLight, lightProgress } from "./hint-look";
import type { RenderProps } from "./stage";

/**
 * 提示牌：书里的提示框。上面一条标题牌写「提示」和编号（`label`、`number`），
 * 下面是大号的提示标题（`title`），占满分镜给的格子，右下留出硬阴影的偏移。
 * 内边距和字宽口径同声明里的宽度检查（`hintTextRoom`）。
 * 默认入场「亮起」（`light`）：牌子先是暗的，闪一下、灭掉，再亮住，外面扩出一圈黄光；
 * 退场写 `light` 时倒着播，即熄灭。
 */
export const HintSign: React.FC<RenderProps<z.infer<typeof HintSignProps>>> = ({
  props: { label, number, title },
  stage,
}) => {
  const { lit, glowOffset } = hintLight(lightProgress(stage, "light"));
  const text = lit ? COLOR.ink : COLOR.hintUnlitText;
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
          flexDirection: "column",
          backgroundColor: lit ? COLOR.hintBoard : COLOR.hintUnlit,
          border: border(SIZE.strokeThick, COLOR.ink),
          boxShadow: hardShadow(COLOR.ink),
          ...(glowOffset === null
            ? {}
            : {
                outline: border(SIZE.hintGlow, COLOR.hintGlow),
                outlineOffset: glowOffset,
              }),
        }}
      >
        <div
          style={{
            display: "flex",
            gap: SIZE.blockPadding,
            padding: SIZE.blockPadding,
            backgroundColor: lit ? COLOR.accent : COLOR.hintUnlit,
            borderBottom: border(SIZE.strokeThick, COLOR.ink),
            color: lit ? COLOR.onAccent : COLOR.hintUnlitText,
            ...pixelText(HINT_FONT.header),
            whiteSpace: "nowrap",
          }}
        >
          <span>{label}</span>
          <span>{number}</span>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: SIZE.blockPadding,
            color: text,
            ...pixelText(HINT_FONT.title),
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
};
