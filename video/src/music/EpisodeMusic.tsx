import { Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { MusicPlan } from "../episode/episode-plan";
import { VOLUME } from "../style/volume";
import { loopFrames, MUSIC } from "./tracks";

/**
 * 配乐：从 `startFrame`（片头结束）起循环播放到 `endFrame`（正文结束、片尾开始），
 * 从 `fadeFrom` 帧起线性淡出，到 `endFrame` 归零，最后一次循环在 `endFrame` 截断。
 * 片头片尾自带音轨，配乐不覆盖它们（#50、#51）。
 *
 * 循环不用 Html5Audio 的 `loop`：实测（#39 全长试验）它在每个接缝处有约一帧的静音，
 * 曲子还会每循环一次往后错约 3 毫秒。改成每次循环一个 Sequence，各放一份曲子；
 * 登记表保证循环长度是整数帧（`loopFrames`），Sequence 首尾正好相接。
 * 每个 Sequence 的位置不同，Remotion 不会把它们当成同一个资源合并（#37 的评论）。
 *
 * 音量在这里用 `useCurrentFrame` 算成数值再传进去，不用 `volume` 回调：回调拿到的是
 * Sequence 里的帧数，每次循环都归零，淡出会落在错误的位置（spec #16 修订）。
 * 这个组件要放在合成的顶层（不在 Sequence 里），`useCurrentFrame` 才是整期的帧数。
 */
export const EpisodeMusic: React.FC<{ music: MusicPlan }> = ({ music }) => {
  const volume = interpolate(
    useCurrentFrame(),
    [music.fadeFrom, music.endFrame],
    [VOLUME.music, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const length = loopFrames(music.track);
  const starts = Array.from(
    { length: Math.ceil((music.endFrame - music.startFrame) / length) },
    (_, i) => music.startFrame + i * length,
  );
  return (
    <>
      {starts.map((from) => (
        <Sequence
          key={from}
          from={from}
          durationInFrames={Math.min(length, music.endFrame - from)}
          layout="none"
        >
          <Html5Audio src={staticFile(MUSIC[music.track].file)} volume={volume} />
        </Sequence>
      ))}
    </>
  );
};
