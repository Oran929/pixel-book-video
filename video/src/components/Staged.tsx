import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { Animation } from "./declaration";
import { animationFrames } from "./declaration";
import type { Cue } from "../episode/storyboard";
import { SIZE, snapToGrid } from "../style/style";
import { VIDEO } from "../video-config";
import { componentNamed } from "./registry";

// 在场程度 0 → 1 对应的样子：淡入淡出，或从上方落下、向上升起（位移取整到像素网格）
const look = (animation: Animation, shown: number): React.CSSProperties => {
  if (animation === "fade") return { opacity: shown };
  if (animation === "slide") {
    return {
      transform: `translateY(${snapToGrid((shown - 1) * SIZE.slideDistance)}px)`,
    };
  }
  return {};
};

// 从 `from` 帧起播 `animation`，返回在场程度；`none` 不播，直接是 1
const progress = (frame: number, from: number, animation: Animation) => {
  const frames = animationFrames(animation, VIDEO.fps);
  if (frames === 0) return 1;
  return interpolate(frame, [from, from + frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
};

/**
 * 按排期放一个组件：入场和退场套上通用动画（帧相对于入场帧）。
 * 状态暂时不传给组件，渲染接口见 #35。
 */
export const Staged: React.FC<{ cue: Cue }> = ({ cue }) => {
  const frame = useCurrentFrame();
  const Component = componentNamed(cue.component);
  const entering = look(cue.enter.animation, progress(frame, 0, cue.enter.animation));
  const exiting = cue.exit
    ? look(
        cue.exit.animation,
        1 - progress(frame, cue.exit.frame - cue.startFrame, cue.exit.animation),
      )
    : {};
  return (
    <AbsoluteFill style={entering}>
      <AbsoluteFill style={exiting}>
        <Component {...cue.props} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
