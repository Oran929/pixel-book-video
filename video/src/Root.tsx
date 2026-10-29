import { Composition } from "remotion";
import {
  calculateEpisodeMetadata,
  Episode,
  EpisodeMusicOnly,
  type EpisodeProps,
} from "./episode/Episode";
// 像素字体在第一帧之前加载完（模块加载时挡住渲染）
import "./style/font";
import { COMPONENT_SAMPLES, samplePlan } from "./components/samples";
import { ComponentSample } from "./stylesheet/ComponentSample";
import { ComponentSamples, componentSamplesFrames } from "./stylesheet/ComponentSamples";
import { STYLE_SHEET, StyleSheet } from "./stylesheet/StyleSheet";
import { VIDEO } from "./video-config";
import { BOOKEND_PREVIEWS } from "./bookend/bookends";

const NO_EPISODE = {
  title: "",
  timeline: null,
  cues: [],
  sounds: [],
  music: null,
  intro: null,
  outro: null,
} satisfies EpisodeProps;

/** 每个合成都用视频的帧率和尺寸（风格样张换成自己的尺寸） */
const FORMAT = { fps: VIDEO.fps, width: VIDEO.width, height: VIDEO.height };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Episode"
      component={Episode}
      calculateMetadata={calculateEpisodeMetadata}
      defaultProps={NO_EPISODE}
      // 占位值：实际总帧数由 calculateMetadata 从时间轴算出
      durationInFrames={1}
      {...FORMAT}
    />
    {/* 只有配乐的声轨：全长试验用它检查循环接缝和淡出（#39） */}
    <Composition
      id="EpisodeMusic"
      component={EpisodeMusicOnly}
      calculateMetadata={calculateEpisodeMetadata}
      defaultProps={NO_EPISODE}
      durationInFrames={1}
      {...FORMAT}
    />
    {/* 片头片尾（#50、#51）：登记的每一个单独渲染出来和参考成片对比；成片里用项目配置选的那个 */}
    {BOOKEND_PREVIEWS.map(({ id, Preview, frames }) => (
      <Composition
        key={id}
        id={id}
        component={Preview}
        durationInFrames={frames}
        {...FORMAT}
      />
    ))}
    {/* 风格样张：只在 Studio 里预览，渲染命令只渲染 Episode */}
    <Composition
      id="StyleSheet"
      component={StyleSheet}
      durationInFrames={1}
      {...FORMAT}
      width={STYLE_SHEET.width}
      height={STYLE_SHEET.height}
    />
    {/* 组件样张：每个组件一页，用假分镜演它的每个状态和每种入场、退场动画 */}
    {(Object.keys(COMPONENT_SAMPLES) as (keyof typeof COMPONENT_SAMPLES)[]).map(
      (name) => (
        <Composition
          key={name}
          id={`Sample-${name}`}
          component={ComponentSample}
          defaultProps={{ name }}
          durationInFrames={samplePlan(name).timeline.totalFrames}
          {...FORMAT}
        />
      ),
    )}
    {/* 组件样片：上面的样张页按组件顺序首尾相接，渲染成一个 MP4 给人看（#44） */}
    <Composition
      id="ComponentSamples"
      component={ComponentSamples}
      durationInFrames={componentSamplesFrames()}
      {...FORMAT}
    />
  </>
);
