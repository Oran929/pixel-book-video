import {
  AbsoluteFill,
  Easing,
  Sequence,
  useCurrentFrame,
} from "remotion";
import type { Animation } from "./declaration";
import type { Cue } from "../episode/storyboard";
import { cellRect, layoutGrid } from "../style/grid";
import { SIZE, snapToGrid } from "../style/style";
import { VIDEO } from "../video-config";
import { componentNamed } from "./registry";
import { stageAt } from "./stage";

const GRID = layoutGrid(VIDEO.width, VIDEO.height);
const ease = Easing.out(Easing.cubic);

// 在场程度 0 → 1 对应的样子：淡入淡出，或从上方落下、向上升起（位移取整到像素网格）；
// `none` 和组件自己的特殊效果（声明的 `effects`）不套样式，特殊效果由组件按舞台信息自己画
const look = (animation: Animation, shown: number): React.CSSProperties => {
  if (animation === "fade") return { opacity: shown };
  if (animation === "slide") {
    return {
      transform: `translateY(${snapToGrid((shown - 1) * SIZE.slideDistance)}px)`,
    };
  }
  return {};
};

/**
 * 按排期放一个组件：放进它在网格上占的矩形（连线类组件铺满画面，另外拿到两端的矩形），
 * 套上通用的入场和退场动画，再把参数和这一帧的舞台信息交给组件。
 * 要放在从 `cue.startFrame` 开始的 Sequence 里（见 `StagedCues`）。
 */
export const Staged: React.FC<{ cue: Cue }> = ({ cue }) => {
  const stage = stageAt(cue, cue.startFrame + useCurrentFrame());
  const Component = componentNamed(cue.component);
  const box = cue.area ? cellRect(GRID, cue.area.at, cue.area.cells) : null;
  const ends = cue.ends
    ? {
        from: cellRect(GRID, cue.ends.from.at, cue.ends.from.cells),
        to: cellRect(GRID, cue.ends.to.at, cue.ends.to.cells),
      }
    : null;
  return (
    <AbsoluteFill
      style={
        box
          ? { left: box.x, top: box.y, width: box.width, height: box.height }
          : {}
      }
    >
      <AbsoluteFill style={look(cue.enter.animation, ease(stage.enter))}>
        <AbsoluteFill
          style={
            cue.exit ? look(cue.exit.animation, 1 - ease(stage.exit)) : {}
          }
        >
          <Component props={cue.props} stage={stage} ends={ends} />
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 一期（或一页样张）的全部组件：每个组件在自己的区间里出现 */
export const StagedCues: React.FC<{ cues: Cue[] }> = ({ cues }) => (
  <>
    {cues.map((cue) => (
      <Sequence
        key={cue.key}
        from={cue.startFrame}
        durationInFrames={cue.endFrame - cue.startFrame}
      >
        <Staged cue={cue} />
      </Sequence>
    ))}
  </>
);
