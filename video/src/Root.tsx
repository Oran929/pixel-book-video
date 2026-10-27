import { AbsoluteFill, Composition } from "remotion";
import { VIDEO } from "./video-config";

const Placeholder: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#f4ecd8" }} />
);

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Placeholder"
    component={Placeholder}
    durationInFrames={VIDEO.fps * 2}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
  />
);
