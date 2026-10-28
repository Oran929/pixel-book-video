import {
  AbsoluteFill,
  type CalculateMetadataFunction,
  Html5Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Entering } from "../components/Entering";
import { EpisodeTitle } from "../shell/EpisodeTitle";
import { Subtitle } from "../shell/Subtitle";
import { COLOR } from "../style/style";
import { planEpisode } from "./episode-plan";
import type { Cue } from "./storyboard";
import { lineAt, type Timeline } from "./timeline";

// 合成清单和分镜由 `pixelbook voice` / `pixelbook stage` 复制到 video/public/episode/
const MANIFEST_FILE = "episode/episode.json";
const STORYBOARD_FILE = "episode/storyboard.json";

export type EpisodeProps = {
  /** 这一期的书名或主题名（合成清单的 `title`）；没读到合成清单时为空 */
  title: string;
  timeline: Timeline | null;
  cues: Cue[];
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
  const { manifest, timeline, cues } = planEpisode(
    manifestData,
    storyboardData,
  );
  return {
    durationInFrames: timeline.totalFrames,
    props: { title: manifest.title, timeline, cues },
  };
};

const CurrentSubtitle: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const line = lineAt(timeline, useCurrentFrame());
  return line ? <Subtitle text={line.text} /> : null;
};

export const Episode: React.FC<EpisodeProps> = ({ title, timeline, cues }) => (
  <AbsoluteFill style={{ backgroundColor: COLOR.background }}>
    {title ? <EpisodeTitle title={title} /> : null}
    {cues.map((cue) => (
      <Sequence
        key={cue.key}
        from={cue.startFrame}
        durationInFrames={cue.endFrame - cue.startFrame}
      >
        <Entering cue={cue} />
      </Sequence>
    ))}
    {timeline?.lines.map((line) => (
      // 每句的音频单独放置，不拼接成一条音轨（ADR-0003）
      <Sequence
        key={line.id}
        from={line.startFrame}
        durationInFrames={line.endFrame - line.startFrame}
        layout="none"
      >
        <Html5Audio src={staticFile(line.audio)} />
      </Sequence>
    ))}
    {timeline ? <CurrentSubtitle timeline={timeline} /> : null}
  </AbsoluteFill>
);
