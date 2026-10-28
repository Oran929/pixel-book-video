import {
  AbsoluteFill,
  type CalculateMetadataFunction,
  Easing,
  Html5Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { componentNamed } from "../components/registry";
import { COMPONENT_SCHEMAS } from "../components/schemas";
import { VIDEO } from "../video-config";
import { parseManifest } from "./manifest";
import {
  type Cue,
  parseStoryboard,
  pauseOverrides,
  scheduleCues,
} from "./storyboard";
import { computeTimeline, DEFAULT_PAUSES, lineAt, type Timeline } from "./timeline";

// 合成清单和分镜由 `pixelbook voice` / `pixelbook stage` 复制到 video/public/episode/
const MANIFEST_FILE = "episode/episode.json";
const STORYBOARD_FILE = "episode/storyboard.json";

export type EpisodeProps = { timeline: Timeline | null; cues: Cue[] };

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
  const manifest = parseManifest(manifestData);
  const storyboardData = await readJson(STORYBOARD_FILE, abortSignal);
  const storyboard =
    storyboardData === null
      ? null
      : parseStoryboard(storyboardData, manifest, COMPONENT_SCHEMAS);
  const timeline = computeTimeline(
    manifest,
    DEFAULT_PAUSES,
    VIDEO.fps,
    storyboard ? pauseOverrides(storyboard) : {},
  );
  const cues = storyboard ? scheduleCues(storyboard, timeline) : [];
  return { durationInFrames: timeline.totalFrames, props: { timeline, cues } };
};

// 组件出现时的动画时长；淡入或从上方落下
const ENTER_SECONDS = 0.4;
const SLIDE_DISTANCE = 160;

const Entering: React.FC<{ cue: Cue }> = ({ cue }) => {
  const progress = interpolate(
    useCurrentFrame(),
    [0, Math.round(ENTER_SECONDS * VIDEO.fps)],
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
          : { transform: `translateY(${(progress - 1) * SLIDE_DISTANCE}px)` }
      }
    >
      <Component {...cue.props} />
    </AbsoluteFill>
  );
};

const Subtitle: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const line = lineAt(timeline, useCurrentFrame());
  if (!line) return null;
  return (
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center", padding: 64 }}
    >
      <div
        style={{
          minWidth: 960,
          padding: "24px 48px",
          backgroundColor: "#2b2b3a",
          border: "8px solid #f4ecd8",
          outline: "8px solid #2b2b3a",
          color: "#f4ecd8",
          fontSize: 48,
          lineHeight: 1.3,
          textAlign: "center",
        }}
      >
        {line.text}
      </div>
    </AbsoluteFill>
  );
};

export const Episode: React.FC<EpisodeProps> = ({ timeline, cues }) => (
  <AbsoluteFill style={{ backgroundColor: "#f4ecd8" }}>
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
    {timeline ? <Subtitle timeline={timeline} /> : null}
  </AbsoluteFill>
);
