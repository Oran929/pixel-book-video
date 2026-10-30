// 音效登记表（#37）：音效 ID → 文件（以 `video/public/` 为起点，交给 staticFile）。
// 纯 .ts、不读文件系统：分镜检查（Node 里的时间轴导出命令）和 Remotion 播放共用这一份导入。
// 每个音效旁边有一份展开后的 jsfxr 参数 `<ID>.sfxr.json`，由 `npm run sfx` 生成 wav（见 `docs/reference/storyboard.md`「音效」）。

/** 音效文件所在的目录（`video/public/` 下）；不能放在 `episode/` 下，配音会删掉那个目录 */
export const SOUND_DIR = "sfx";

export const SOUNDS = {
  /** 落下：短促的下滑方波，知识块落下 */
  drop: `${SOUND_DIR}/drop.wav`,
  /** 弹出：短促的上扬方波，淡入出现 */
  pop: `${SOUND_DIR}/pop.wav`,
  /** 切换：一声轻点，切到另一个状态 */
  blip: `${SOUND_DIR}/blip.wav`,
  /** 嗡：低沉的锯齿波，出错、被改动 */
  buzz: `${SOUND_DIR}/buzz.wav`,
  /** 叮：两段上扬的金币声，点亮、提示牌亮起 */
  ding: `${SOUND_DIR}/ding.wav`,
  /** 退场：轻柔的下滑三角波 */
  leave: `${SOUND_DIR}/leave.wav`,
  /** 崩溃：噪声爆炸声，电脑崩溃 */
  crash: `${SOUND_DIR}/crash.wav`,
} as const;

export type SoundId = keyof typeof SOUNDS;

/** 组件声明和分镜里的音效：登记过的音效 ID，或 null（不放音效） */
export type Sound = SoundId | null;

export const isSoundId = (id: string): id is SoundId => Object.hasOwn(SOUNDS, id);

/** 本期要放的一个音效：在第几帧响哪个音效 */
export type SoundCue = { frame: number; sound: SoundId };
