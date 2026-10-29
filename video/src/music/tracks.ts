// 配乐登记表（#38）：曲子 ID → 文件和来源。
// 纯 .ts、不读文件系统：分镜检查（Node 里的时间轴导出命令）和 Remotion 播放共用这一份导入。
import { VIDEO } from "../video-config";

/** 配乐文件所在的目录（`video/public/` 下）；不能放在 `episode/` 下，配音会删掉那个目录 */
export const MUSIC_DIR = "music";

export type MusicTrack = {
  /** 文件，以 `video/public/` 为起点（交给 staticFile） */
  file: string;
  title: string;
  author: string;
  /** 作品页 */
  source: string;
  /** 只收 CC0（spec #16 用户故事 46） */
  license: string;
  /** 在作品页上核对许可的日期 */
  checkedOn: string;
  sampleRate: number;
  sampleCount: number;
  seamless: boolean;
};

/** 一帧有几个采样：30fps 下 44.1kHz 是 1470 个，48kHz 是 1600 个 */
export const samplesPerFrame = (sampleRate: number): number => sampleRate / VIDEO.fps;

/** 校验登记表：许可只能是 CC0；采样数是一帧采样数的整数倍，循环长度不会被取整到帧 */
export const defineMusicLibrary = <T extends Record<string, MusicTrack>>(tracks: T): T => {
  for (const [id, track] of Object.entries(tracks)) {
    if (track.license !== "CC0") {
      throw new Error(`配乐 ${id} 的许可是 ${track.license}，配乐库只收 CC0`);
    }
    const perFrame = samplesPerFrame(track.sampleRate);
    if (!Number.isInteger(perFrame)) {
      throw new Error(`配乐 ${id} 的采样率 ${track.sampleRate} Hz 在 ${VIDEO.fps}fps 下一帧不是整数个采样`);
    }
    if (track.sampleCount % perFrame !== 0) {
      throw new Error(`配乐 ${id} 的采样数 ${track.sampleCount} 不是一帧 ${perFrame} 个采样的整数倍`);
    }
  }
  return tracks;
};

const OGA = "https://opengameart.org/content";
const ZANE = "Zane Little Music";
/** 8 首曲子的许可都是 2026-10-29 在作品页上核对的：每页只挂了 CC0 一种许可 */
const CHECKED = "2026-10-29";

export const MUSIC = defineMusicLibrary({
  "flowerbed-fields": {
    file: `${MUSIC_DIR}/flowerbed-fields.ogg`,
    title: "Flowerbed Fields [Loop]",
    author: ZANE,
    source: `${OGA}/flowerbed-fields-loop`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 4671660,
    seamless: true,
  },
  "sideways-city": {
    file: `${MUSIC_DIR}/sideways-city.ogg`,
    title: "Sideways City（循环版 sideways_city_loop.wav）",
    author: ZANE,
    source: `${OGA}/sideways-city`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 5080320,
    seamless: true,
  },
  "starlight-city": {
    file: `${MUSIC_DIR}/starlight-city.ogg`,
    title: "Starlight City（zip 里的 Loop/Starlight City LOOP.wav）",
    author: ZANE,
    source: `${OGA}/starlight-city-loop-included`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 48000,
    sampleCount: 4808000,
    seamless: true,
  },
  "pixel-sprinter": {
    file: `${MUSIC_DIR}/pixel-sprinter.ogg`,
    title: "Pixel Sprinter（循环版 pixel_sprinter_loop.wav）",
    author: ZANE,
    source: `${OGA}/pixel-sprinter`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 1512630,
    seamless: true,
  },
  "the-arplands": {
    file: `${MUSIC_DIR}/the-arplands.ogg`,
    title: "The Arplands",
    author: "LordZintick",
    source: `${OGA}/the-arplands`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 48000,
    sampleCount: 6912000,
    seamless: true,
  },
  "lasso-lady": {
    file: `${MUSIC_DIR}/lasso-lady.ogg`,
    title: "Lasso Lady (seamless loop)",
    author: "congusbongus",
    source: `${OGA}/lasso-lady-seamless-loop`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 3251640,
    seamless: true,
  },
  "arcade-background-music": {
    file: `${MUSIC_DIR}/arcade-background-music.ogg`,
    title: "arcade background music",
    author: "aqrezes",
    source: `${OGA}/arcade-background-music`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 3626490,
    seamless: true,
  },
  "delayed-chiptune": {
    file: `${MUSIC_DIR}/delayed-chiptune.ogg`,
    title: "Delayed Chiptune",
    author: "Centurion_of_war",
    source: `${OGA}/delayed-chiptune`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 2003610,
    seamless: true,
  },
});

export type MusicId = keyof typeof MUSIC;

export const isMusicId = (id: string): id is MusicId => Object.hasOwn(MUSIC, id);

/** 曲子循环一次有几帧（登记表保证是整数） */
export const loopFrames = (id: MusicId): number =>
  MUSIC[id].sampleCount / samplesPerFrame(MUSIC[id].sampleRate);
