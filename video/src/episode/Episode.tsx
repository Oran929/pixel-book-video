import {
  AbsoluteFill,
  type CalculateMetadataFunction,
  Html5Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { StagedCues } from "../components/Staged";
import { SoundCues } from "../sound/SoundCues";
import type { SoundCue } from "../sound/sounds";
import { EpisodeTitle } from "../components/resident/EpisodeTitle";
import { Subtitle } from "../components/resident/Subtitle";
import { COLOR } from "../style/style";
import { VOLUME } from "../style/volume";
import { EpisodeMusic } from "../music/EpisodeMusic";
import { BookendWithAudio } from "../bookend/BookendWithAudio";
import { INTRO_COMPONENTS } from "../intro/intro-components";
import { type IntroId, INTROS } from "../intro/intros";
import { OUTRO_COMPONENTS } from "../outro/outro-components";
import { type OutroId, OUTROS } from "../outro/outros";
import { type MusicPlan, planEpisode } from "./episode-plan";
import type { Cue } from "./storyboard";
import { bodyEndFrame, lineAt, showsResidents, type Timeline } from "./timeline";

// 合成清单和分镜由 `pixelbook voice` / `pixelbook stage` 复制到 video/public/episode/
const MANIFEST_FILE = "episode/episode.json";
const STORYBOARD_FILE = "episode/storyboard.json";

export type EpisodeProps = {
  /** 这一期的主题（合成清单的 `title`）；没读到合成清单时为空 */
  title: string;
  timeline: Timeline | null;
  cues: Cue[];
  /** 要放的音效（帧、音效 ID） */
  sounds: SoundCue[];
  /** 配乐；没有分镜（字幕版）时为 null，不放配乐 */
  music: MusicPlan | null;
  /** 片头、片尾（登记表的 ID，项目配置选的）；不用时为 null */
  intro: IntroId | null;
  outro: OutroId | null;
};

const readJson = async (file: string, signal: AbortSignal) => {
  const response = await fetch(staticFile(file), { signal });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`读不到 public/${file}（HTTP ${response.status}）`);
  }
  return (await response.json()) as unknown;
};

// 只读合成清单和分镜（ADR-0004）；总时长取自时间轴（ADR-0003）。
// 没有分镜时照常渲染，只有字幕。
export const calculateEpisodeMetadata: CalculateMetadataFunction<
  EpisodeProps
> = async ({ abortSignal }) => {
  const manifestData = await readJson(MANIFEST_FILE, abortSignal);
  if (manifestData === null) {
    throw new Error(
      `public/${MANIFEST_FILE} 不存在：先运行 \`pixelbook voice\` 或 \`pixelbook stage\``,
    );
  }
  const storyboardData = await readJson(STORYBOARD_FILE, abortSignal);
  const { manifest, timeline, cues, sounds, music, intro, outro } = planEpisode(
    manifestData,
    storyboardData,
  );
  return {
    durationInFrames: timeline.totalFrames,
    props: { title: manifest.title, timeline, cues, sounds, music, intro, outro },
  };
};

/** 主题：片头、片尾期间不显示（spec #16 修订二、修订三） */
const CurrentTitle: React.FC<{ title: string; timeline: Timeline | null }> = ({
  title,
  timeline,
}) => {
  const frame = useCurrentFrame();
  if (!title) return null;
  if (timeline && !showsResidents(timeline, frame)) return null;
  return <EpisodeTitle title={title} />;
};

/** 当前这句旁白的字幕（两句之间的停顿里继续显示上一句；片头、片尾期间不显示） */
export const CurrentSubtitle: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const frame = useCurrentFrame();
  const line = lineAt(timeline, frame);
  return line && showsResidents(timeline, frame) ? <Subtitle text={line.text} /> : null;
};

export const Episode: React.FC<EpisodeProps> = ({
  title,
  timeline,
  cues,
  sounds,
  music,
  intro,
  outro,
}) => (
  <AbsoluteFill style={{ backgroundColor: COLOR.background }}>
    <CurrentTitle title={title} timeline={timeline} />
    <StagedCues cues={cues} />
    {timeline?.lines.map((line) => (
      // 每句的音频单独放置，不拼接成一条音轨（ADR-0003）
      <Sequence
        key={line.id}
        from={line.startFrame}
        durationInFrames={line.endFrame - line.startFrame}
        layout="none"
      >
        <Html5Audio src={staticFile(line.audio)} volume={VOLUME.narration} />
      </Sequence>
    ))}
    <SoundCues sounds={sounds} />
    {music ? <EpisodeMusic music={music} /> : null}
    {timeline ? <CurrentSubtitle timeline={timeline} /> : null}
    {/* 片头片尾盖在最上面；它们期间没有字幕和主题，正文在片头结束后开始、片尾开始前结束 */}
    {intro ? (
      <BookendWithAudio
        bookend={INTROS[intro]}
        component={INTRO_COMPONENTS[intro]}
        volume={VOLUME.intro}
      />
    ) : null}
    {outro && timeline ? (
      <BookendWithAudio
        bookend={OUTROS[outro]}
        component={OUTRO_COMPONENTS[outro]}
        volume={VOLUME.outro}
        from={bodyEndFrame(timeline)}
      />
    ) : null}
  </AbsoluteFill>
);

/**
 * 只有配乐的声轨：和 Episode 同一份排期，不放旁白和音效。
 * 全长试验（#39）渲染它来单独检查配乐的循环接缝和淡出，免得旁白混在里面。
 */
export const EpisodeMusicOnly: React.FC<EpisodeProps> = ({ music }) =>
  music ? <EpisodeMusic music={music} /> : null;
