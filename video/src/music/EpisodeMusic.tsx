import { Html5Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { MusicPlan } from "../episode/episode-plan";
import { musicPlays, musicVolume } from "./crossfade";
import { MUSIC, trackFrames } from "./tracks";

/**
 * 配乐：从 `startFrame`（片头结束）起放到 `endFrame`（正文结束、片尾开始），曲子比正片短时
 * 循环，每个接缝处曲尾和下一次的曲首重叠 1 秒交叉淡化（`musicPlays`，#52）；从 `fadeFrom`
 * 帧起线性淡出，到 `endFrame` 归零，最后一次在 `endFrame` 截断。片头片尾自带音轨，配乐不覆盖
 * 它们（#50、#51）。
 *
 * 每次循环一个 Sequence，各放一份曲子（不用 Html5Audio 的 `loop`：#39 实测它在接缝处有约一帧
 * 的静音）。每个 Sequence 的位置不同，Remotion 不会把它们当成同一个资源合并（#37 的评论）。
 *
 * 音量在这里用 `useCurrentFrame` 算成数值再传进去，不用 `volume` 回调：回调拿到的是
 * Sequence 里的帧数，每次循环都归零，淡出会落在错误的位置（spec #16 修订）。
 * 这个组件要放在合成的顶层（不在 Sequence 里），`useCurrentFrame` 才是整期的帧数。
 */
export const EpisodeMusic: React.FC<{ music: MusicPlan }> = ({ music }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {musicPlays(music, trackFrames(music.track)).map((play) => (
        <Sequence key={play.from} from={play.from} durationInFrames={play.to - play.from} layout="none">
          <Html5Audio src={staticFile(MUSIC[music.track].file)} volume={musicVolume(music, play, frame)} />
        </Sequence>
      ))}
    </>
  );
};
