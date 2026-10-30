// 配乐登记表（#38，#52 换成新的 8 首）：曲子 ID → 文件和来源。
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
  /**
   * 只收 CC0 和 CC-BY（`CC-BY 3.0`、`CC-BY 4.0` 这样写版本号；spec #16 修订三）。
   * 作品页同时给了几种许可时，写我们选用的那一种
   */
  license: string;
  /**
   * 署名：CC-BY 必填，一行，照作品页的署名要求写（曲名、作者、作品页、许可），
   * 用了这首的那一期在期目录的 `out/` 里写出 `credits.txt`（#52）；CC0 不写
   */
  credit?: string;
  /** 在作品页上核对许可的日期 */
  checkedOn: string;
  sampleRate: number;
  sampleCount: number;
};

/** 许可是不是 CC-BY（任何版本） */
export const isCcBy = (license: string): boolean => /^CC-BY \d\.\d$/.test(license);

/** 一帧有几个采样：30fps 下 44.1kHz 是 1470 个，48kHz 是 1600 个 */
export const samplesPerFrame = (sampleRate: number): number => sampleRate / VIDEO.fps;

/**
 * 校验登记表：许可只能是 CC0 或 CC-BY，CC-BY 要写署名；采样数是一帧采样数的整数倍，
 * 曲长是整数帧，循环的起点不会被取整
 */
export const defineMusicLibrary = <T extends Record<string, MusicTrack>>(tracks: T): T => {
  for (const [id, track] of Object.entries(tracks)) {
    if (track.license !== "CC0" && !isCcBy(track.license)) {
      throw new Error(`配乐 ${id} 的许可是 ${track.license}，配乐库只收 CC0 和 CC-BY`);
    }
    if (isCcBy(track.license) && !track.credit?.trim()) {
      throw new Error(`配乐 ${id} 的许可是 ${track.license}，要写署名 credit`);
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
const TAD = "TAD";
/**
 * 8 首的许可都是 2026-10-29 在作品页上核对的（#52）。用户给的文件和作品页上的下载文件
 * 逐字节比过（SHA-256 相同），所以版本对得上：Iced Village 和 The Past 是 8-bit lofi 版
 * （不是只给 CC-BY 的钢琴版和原版）。每页都给了 CC0，有的同时给了 CC-BY 或 OGA-BY，
 * 按 CC0 用，简介里不用署名
 */
const CHECKED = "2026-10-29";

export const MUSIC = defineMusicLibrary({
  ooame: {
    file: `${MUSIC_DIR}/ooame.ogg`,
    title: "Ooame",
    author: TAD,
    // 作品页：CC-BY 4.0 和 CC0
    source: `${OGA}/ooame`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 11023530,
  },
  "iced-village": {
    file: `${MUSIC_DIR}/iced-village.ogg`,
    title: "Iced Village (8 Bit Lofi Hip Hop)",
    author: TAD,
    // 作品页：CC-BY 4.0 和 CC0
    source: `${OGA}/iced-village-8-bit-lofi-hip-hop`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 19264350,
  },
  "the-past": {
    file: `${MUSIC_DIR}/the-past.ogg`,
    title: "The Past (8 Bit Lofi Hip Hop)",
    author: TAD,
    // 作品页：CC-BY 4.0 和 CC0
    source: `${OGA}/the-past-8-bit-lofi-hip-hop`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 8064420,
  },
  "since-2-am": {
    file: `${MUSIC_DIR}/since-2-am.ogg`,
    title: "Since 2 A.M.",
    author: TAD,
    source: `${OGA}/since-2-am`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 11192580,
  },
  "forgotten-path": {
    file: `${MUSIC_DIR}/forgotten-path.ogg`,
    title: "forgotten path",
    author: "johndekale",
    source: `${OGA}/forgotten-path`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 1765470,
  },
  "slow-melancholic-theme": {
    file: `${MUSIC_DIR}/slow-melancholic-theme.ogg`,
    title: "Slow Melancholic Theme C64 Style（long version with refrain）",
    author: "skrjablin",
    // 作品页：CC-BY 3.0 和 CC0；作者在评论里说署名随意、不是必须的
    source: `${OGA}/slow-melancholic-theme-c64-style`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 10301760,
  },
  "tiny-sad-lonely-theme": {
    file: `${MUSIC_DIR}/tiny-sad-lonely-theme.ogg`,
    title: "Tiny sad lonely theme",
    author: "MAOU",
    source: `${OGA}/tiny-sad-lonely-theme`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 44100,
    sampleCount: 3256050,
  },
  kalypo: {
    file: `${MUSIC_DIR}/kalypo.ogg`,
    title: "Kalypo",
    author: "Spring Spring",
    // 作品页：OGA-BY 3.0 和 CC0（曲名是 Kalypo，作者是 Spring Spring）；原件 96 kHz，入库降到 48 kHz
    source: `${OGA}/kalypo`,
    license: "CC0",
    checkedOn: CHECKED,
    sampleRate: 48000,
    sampleCount: 17350400,
  },
});

export type MusicId = keyof typeof MUSIC;

export const isMusicId = (id: string): id is MusicId => Object.hasOwn(MUSIC, id);

/** 曲长几帧（登记表保证是整数） */
export const trackFrames = (id: MusicId): number =>
  MUSIC[id].sampleCount / samplesPerFrame(MUSIC[id].sampleRate);
