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
import { BookendWithAudio } from "./bookend/BookendWithAudio";
import type { Bookend } from "./bookend/library";
import { INTRO_COMPONENTS } from "./intro/intro-components";
import { INTROS } from "./intro/intros";
import { OUTRO_COMPONENTS } from "./outro/outro-components";
import { OUTROS } from "./outro/outros";
import { VOLUME } from "./style/volume";

const NO_EPISODE = {
  title: "",
  timeline: null,
  cues: [],
  sounds: [],
  music: null,
  intro: null,
  outro: null,
} satisfies EpisodeProps;

/**
 * 每个登记的片头或片尾一个合成（`Intro-<ID>`、`Outro-<ID>`），单独放它，和参考成片对比。
 * 动画组件不能经 `defaultProps` 传（Remotion 把 props 序列化成 JSON，函数会丢），
 * 所以在模块加载时给每一个包一个不带参数的组件。
 */
const bookendCompositions = (
  prefix: string,
  library: Record<string, Bookend>,
  components: Record<string, React.FC>,
  volume: number,
) =>
  Object.entries(library).map(([id, bookend]) => {
    const component = components[id]!;
    const Preview: React.FC = () => (
      <BookendWithAudio bookend={bookend} component={component} volume={volume} />
    );
    return { id: `${prefix}-${id}`, Preview, frames: bookend.frames };
  });

const BOOKEND_PREVIEWS = [
  ...bookendCompositions("Intro", INTROS, INTRO_COMPONENTS, VOLUME.intro),
  ...bookendCompositions("Outro", OUTROS, OUTRO_COMPONENTS, VOLUME.outro),
];

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Episode"
      component={Episode}
      calculateMetadata={calculateEpisodeMetadata}
      defaultProps={NO_EPISODE}
      // 占位值：实际总帧数由 calculateMetadata 从时间轴算出
      durationInFrames={1}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
    />
    {/* 只有配乐的声轨：全长试验用它检查循环接缝和淡出（#39） */}
    <Composition
      id="EpisodeMusic"
      component={EpisodeMusicOnly}
      calculateMetadata={calculateEpisodeMetadata}
      defaultProps={NO_EPISODE}
      durationInFrames={1}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
    />
    {/* 片头片尾（#50、#51）：登记的每一个单独渲染出来和参考成片对比；成片里用项目配置选的那个 */}
    {BOOKEND_PREVIEWS.map(({ id, Preview, frames }) => (
      <Composition
        key={id}
        id={id}
        component={Preview}
        durationInFrames={frames}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />
    ))}
    {/* 风格样张：只在 Studio 里预览，渲染命令只渲染 Episode */}
    <Composition
      id="StyleSheet"
      component={StyleSheet}
      durationInFrames={1}
      fps={VIDEO.fps}
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
          fps={VIDEO.fps}
          width={VIDEO.width}
          height={VIDEO.height}
        />
      ),
    )}
    {/* 组件样片：上面的样张页按组件顺序首尾相接，渲染成一个 MP4 给人看（#44） */}
    <Composition
      id="ComponentSamples"
      component={ComponentSamples}
      durationInFrames={componentSamplesFrames()}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
    />
  </>
);
