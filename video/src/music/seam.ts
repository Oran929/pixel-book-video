// 循环接缝检查（#38）：把曲尾接回曲首，看接缝两侧是否接得上。
// 只量两样：接缝处的采样差（和接缝两侧各 10 毫秒里相邻采样的最大差比）和
// 接缝两侧各 50 毫秒的 RMS 跳变。听感留给人工关口 3。

export type PcmAudio = {
  /** 交错排列的浮点采样（-1 到 1） */
  samples: Float32Array;
  channels: number;
  sampleRate: number;
};

/** 采样差超过这个值，并且超过接缝两侧相邻采样最大差的 JUMP_RATIO 倍，就算断开 */
export const JUMP_FLOOR = 0.01;
export const JUMP_RATIO = 2;
/** 比较相邻采样差的窗口（秒） */
export const LOCAL_SECONDS = 0.01;
/** 比较 RMS 的窗口（秒）；跳变超过 RMS_JUMP_DB 或一侧低于 SILENCE_DB 就算不无缝 */
export const RMS_SECONDS = 0.05;
export const RMS_JUMP_DB = 10;
export const SILENCE_DB = -60;

export type Seam = {
  /** 接缝处最大的采样差（各声道取最大） */
  jump: number;
  /** 接缝两侧窗口里相邻采样的最大差（取断开最明显的那个声道） */
  localDiff: number;
  /** 曲尾、曲首窗口的 RMS（dBFS） */
  tailDb: number;
  headDb: number;
  seamless: boolean;
  /** 不无缝的原因；无缝时为空 */
  problems: string[];
};

const toDb = (rms: number) => (rms > 0 ? 20 * Math.log10(rms) : -Infinity);

export const measureSeam = ({ samples, channels, sampleRate }: PcmAudio): Seam => {
  const frames = samples.length / channels;
  const at = (frame: number, channel: number) => samples[frame * channels + channel]!;
  const problems: string[] = [];

  // 采样差：逐声道比，取断开最明显（jump / localDiff 最大）的声道
  const local = Math.round(sampleRate * LOCAL_SECONDS);
  let jump = 0;
  let localDiff = 0;
  let worst = -1;
  for (let c = 0; c < channels; c++) {
    const channelJump = Math.abs(at(0, c) - at(frames - 1, c));
    let channelLocal = 0;
    for (let i = 1; i < local; i++) {
      channelLocal = Math.max(
        channelLocal,
        Math.abs(at(i, c) - at(i - 1, c)),
        Math.abs(at(frames - i, c) - at(frames - i - 1, c)),
      );
    }
    const ratio = channelJump / Math.max(channelLocal, Number.EPSILON);
    if (ratio > worst) {
      worst = ratio;
      jump = channelJump;
      localDiff = channelLocal;
    }
  }
  if (jump > JUMP_FLOOR && jump > JUMP_RATIO * localDiff) {
    problems.push(
      `接缝处采样差 ${jump.toFixed(4)}，是两侧相邻采样最大差 ${localDiff.toFixed(4)} 的 ${(jump / localDiff).toFixed(1)} 倍`,
    );
  }

  // RMS：所有声道合在一起算
  const window = Math.round(sampleRate * RMS_SECONDS);
  const rms = (from: number) => {
    let sum = 0;
    for (let i = from * channels; i < (from + window) * channels; i++) sum += samples[i]! ** 2;
    return Math.sqrt(sum / (window * channels));
  };
  const tailDb = toDb(rms(frames - window));
  const headDb = toDb(rms(0));
  if (Math.min(tailDb, headDb) < SILENCE_DB) {
    problems.push(`接缝一侧是静音：RMS 曲尾 ${tailDb.toFixed(1)} dBFS、曲首 ${headDb.toFixed(1)} dBFS`);
  } else if (Math.abs(headDb - tailDb) > RMS_JUMP_DB) {
    problems.push(`接缝处 RMS 跳变 ${(headDb - tailDb).toFixed(1)} dB（曲尾 ${tailDb.toFixed(1)}、曲首 ${headDb.toFixed(1)} dBFS）`);
  }

  return { jump, localDiff, tailDb, headDb, seamless: problems.length === 0, problems };
};
