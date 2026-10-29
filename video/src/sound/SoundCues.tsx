import { Html5Audio, Sequence, staticFile } from "remotion";
import { VOLUME } from "../style/volume";
import { type SoundCue, SOUNDS } from "./sounds";

/** 按排期放音效：每个音效在它的帧开始播放，音量是 `VOLUME.sfx`（相对旁白） */
export const SoundCues: React.FC<{ sounds: SoundCue[] }> = ({ sounds }) => (
  <>
    {sounds.map(({ frame, sound }, i) => (
      <Sequence key={`${frame}-${i}`} from={frame} layout="none">
        <Html5Audio src={staticFile(SOUNDS[sound])} volume={VOLUME.sfx} />
      </Sequence>
    ))}
  </>
);
