import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { Cue } from "../episode/storyboard";
import { MOTION, SIZE, snapToGrid } from "../style/style";
import { VIDEO } from "../video-config";
import { componentNamed } from "./registry";

/** 组件出现：淡入，或从上方落下（位移取整到像素网格） */
export const Entering: React.FC<{ cue: Cue }> = ({ cue }) => {
  const progress = interpolate(
    useCurrentFrame(),
    [0, Math.round(MOTION.enterSeconds * VIDEO.fps)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );
  const Component = componentNamed(cue.component);
  return (
    <AbsoluteFill
      style={
        cue.animation === "fade"
          ? { opacity: progress }
          : {
              transform: `translateY(${snapToGrid((progress - 1) * SIZE.slideDistance)}px)`,
            }
      }
    >
      <Component {...cue.props} />
    </AbsoluteFill>
  );
};
