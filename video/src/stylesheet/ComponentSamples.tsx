import { Series } from "remotion";
import { COMPONENT_SAMPLES, type ComponentName, samplePlan } from "../components/samples";
import { ComponentSample } from "./ComponentSample";

// 组件样片（#44）：把每个组件的样张页（`Sample-<组件名>`）按组件注册表的顺序首尾相接，
// 一次看完 7 个组件的每个状态、入场和退场、音效。左上角是样张标题（组件名），
// 字幕位置写着这一刻在演什么（状态名、动画名、音效）。只用来给人看，不进入成片。

const NAMES = Object.keys(COMPONENT_SAMPLES) as ComponentName[];

/** 样片总帧数：各组件样张的帧数之和 */
export const componentSamplesFrames = (): number =>
  NAMES.reduce((sum, name) => sum + samplePlan(name).timeline.totalFrames, 0);

export const ComponentSamples: React.FC = () => (
  <Series>
    {NAMES.map((name) => (
      <Series.Sequence key={name} durationInFrames={samplePlan(name).timeline.totalFrames}>
        <ComponentSample name={name} />
      </Series.Sequence>
    ))}
  </Series>
);
