import { AbsoluteFill } from "remotion";
import { StagedCues } from "../components/Staged";
import { EpisodeTitle } from "../components/resident/EpisodeTitle";
import { type ComponentName, samplePlan } from "../components/samples";
import { CurrentSubtitle } from "../episode/Episode";
import { SoundCues } from "../sound/SoundCues";
import { COLOR } from "../style/style";

// 组件样张页（#35）：只在 Studio 里看（合成 ID `Sample-<组件名>`），不进入成片。
// 和成片一样经过 `planEpisode` 排期、由 `StagedCues` 摆放；左上角是样张标题，
// 字幕位置写着这一刻在演什么。没有旁白音频，只放组件的音效。

export type ComponentSampleProps = { name: ComponentName };

export const ComponentSample: React.FC<ComponentSampleProps> = ({ name }) => {
  const { manifest, timeline, cues, sounds } = samplePlan(name);
  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.background }}>
      <EpisodeTitle title={manifest.title} />
      <StagedCues cues={cues} />
      <SoundCues sounds={sounds} />
      <CurrentSubtitle timeline={timeline} />
    </AbsoluteFill>
  );
};
