import {
  AbsoluteFill,
  type CalculateMetadataFunction,
  Html5Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { VIDEO } from "../video-config";
import { parseManifest } from "./manifest";
import { computeTimeline, DEFAULT_PAUSES, lineAt, type Timeline } from "./timeline";

// 合成清单由 `pixelbook voice` / `pixelbook stage` 复制到 video/public/episode/
const MANIFEST_FILE = "episode/episode.json";

export type EpisodeProps = { timeline: Timeline | null };

// 只读合成清单（ADR-0004）；总时长取自时间轴（ADR-0003）
export const calculateEpisodeMetadata: CalculateMetadataFunction<
  EpisodeProps
> = async ({ abortSignal }) => {
  const response = await fetch(staticFile(MANIFEST_FILE), {
    signal: abortSignal,
  });
  if (!response.ok) {
    throw new Error(
      `读不到 public/${MANIFEST_FILE}（HTTP ${response.status}）：先运行 \`pixelbook voice\` 或 \`pixelbook stage\``,
    );
  }
  const manifest = parseManifest(await response.json());
  const timeline = computeTimeline(manifest, DEFAULT_PAUSES, VIDEO.fps);
  return { durationInFrames: timeline.totalFrames, props: { timeline } };
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
          fontSize: 64,
          lineHeight: 1.3,
          textAlign: "center",
        }}
      >
        {line.text}
      </div>
    </AbsoluteFill>
  );
};

export const Episode: React.FC<EpisodeProps> = ({ timeline }) => (
  <AbsoluteFill style={{ backgroundColor: "#f4ecd8" }}>
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
