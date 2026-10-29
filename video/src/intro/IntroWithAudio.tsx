import { Html5Audio, Sequence, staticFile } from "remotion";
import { VOLUME } from "../style/volume";
import { Intro } from "./Intro";
import { INTRO } from "./intro-config";

/**
 * 片头：用户做好的动画（`Intro.tsx`，原样搬进来，见 #50）加它自带的音轨。
 * 成片放在最前面；Studio 里的 `Intro` 合成单独渲染它，和用户的参考成片对比。
 */
export const IntroWithAudio: React.FC = () => (
  <Sequence durationInFrames={INTRO.frames}>
    <Intro />
    <Html5Audio src={staticFile(INTRO.audio)} volume={VOLUME.intro} />
  </Sequence>
);
