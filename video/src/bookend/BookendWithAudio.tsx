import { Html5Audio, Sequence, staticFile } from "remotion";
import type { Bookend } from "./library";

/**
 * 一段片头或片尾：动画组件加它自带的音轨，从第 `from` 帧起占 `bookend.frames` 帧。
 * 成片里片头放在最前面、片尾接在正文后面，都盖在正片画面上面；Studio 里的
 * `Intro-<ID>`、`Outro-<ID>` 合成单独放它，和用户的参考成片对比。
 */
export const BookendWithAudio: React.FC<{
  bookend: Bookend;
  component: React.FC;
  volume: number;
  from?: number;
}> = ({ bookend, component: Animation, volume, from = 0 }) => (
  <Sequence from={from} durationInFrames={bookend.frames}>
    <Animation />
    <Html5Audio src={staticFile(bookend.audio)} volume={volume} />
  </Sequence>
);
