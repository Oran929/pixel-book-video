import { Composition } from "remotion";
import {
  calculateEpisodeMetadata,
  Episode,
  type EpisodeProps,
} from "./episode/Episode";
import { VIDEO } from "./video-config";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Episode"
    component={Episode}
    calculateMetadata={calculateEpisodeMetadata}
    defaultProps={{ timeline: null } satisfies EpisodeProps}
    // 占位值：实际总帧数由 calculateMetadata 从时间轴算出
    durationInFrames={1}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
  />
);
