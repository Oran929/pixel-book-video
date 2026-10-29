// 交叉淡化接缝检查（#52，取代 #38 的无缝接缝检查）：照播放时的做法把曲尾和曲首重叠
// CROSSFADE_FRAMES 帧（增益按帧取，和 Remotion 一样每帧一个值），看重叠处掉不掉音、爆不爆音。
// 听感（重复感、曲尾自然淡出后再从头开始）留给人工关口 3，这里只把曲尾、曲首比曲子整体
// 轻多少报出来。
import { VIDEO } from "../video-config";
import { CROSSFADE_FRAMES, fadeInGain, fadeOutGain } from "./crossfade";

export type PcmAudio = {
  /** 交错排列的浮点采样（-1 到 1） */
  samples: Float32Array;
  channels: number;
  sampleRate: number;
};

/** 重叠处的一个窗口比两份各自的功率之和低这么多 dB，算互相抵消（掉音） */
export const CANCEL_DB = 6;
/** 重叠处整体比两侧都低（掉音）、都高（爆音）这么多 dB 算问题 */
export const LEVEL_DB = 6;
/** 比较抵消用的窗口（秒）；两份功率之和低于 SILENCE_DB 的窗口不比 */
export const WINDOW_SECONDS = 0.05;
export const SILENCE_DB = -60;
/** 和重叠处比的两侧各多长（秒） */
export const SIDE_SECONDS = 1;
/** 量曲子整体电平的窗口（秒），取中位数 */
const TRACK_WINDOW_SECONDS = 0.1;

export type CrossfadeSeam = {
  /** 重叠前 1 秒（只有曲尾）、重叠处（混合后）、重叠后 1 秒（只有曲首）的 RMS（dBFS） */
  beforeDb: number;
  overlapDb: number;
  afterDb: number;
  /** 重叠里的曲尾、曲首（淡化之前）比曲子整体电平（100 毫秒窗口的中位数）低多少 dB */
  tailBelowTrackDb: number;
  headBelowTrackDb: number;
  /** 掉音、爆音；没有问题时为空 */
  problems: string[];
};

const toDb = (power: number) => (power > 0 ? 10 * Math.log10(power) : -Infinity);

export const measureCrossfade = ({ samples, channels, sampleRate }: PcmAudio): CrossfadeSeam => {
  const frames = samples.length / channels;
  const perFrame = sampleRate / VIDEO.fps;
  const overlap = CROSSFADE_FRAMES * perFrame;
  const side = Math.round(sampleRate * SIDE_SECONDS);
  const tailStart = frames - overlap;
  const at = (frame: number, channel: number) => samples[frame * channels + channel]!;
  /** [from, to) 这段的平均功率（所有声道合在一起） */
  const power = (from: number, to: number) => {
    let sum = 0;
    for (let i = from * channels; i < to * channels; i++) sum += samples[i]! ** 2;
    return sum / ((to - from) * channels);
  };

  // 重叠处：曲尾乘淡出、曲首乘淡入，按帧取增益
  const mixed = new Float64Array(overlap * channels);
  const separate = new Float64Array(overlap);
  let peak = 0;
  for (let j = 0; j < overlap; j++) {
    const k = Math.floor(j / perFrame);
    const out = fadeOutGain(k, CROSSFADE_FRAMES);
    const into = fadeInGain(k, CROSSFADE_FRAMES);
    for (let c = 0; c < channels; c++) {
      const tail = at(tailStart + j, c) * out;
      const head = at(j, c) * into;
      mixed[j * channels + c] = tail + head;
      separate[j] = separate[j]! + tail ** 2 + head ** 2;
      peak = Math.max(peak, Math.abs(tail + head));
    }
  }
  const mixedPower = (from: number, to: number) => {
    let sum = 0;
    for (let i = from * channels; i < to * channels; i++) sum += mixed[i]! ** 2;
    return sum / ((to - from) * channels);
  };

  const problems: string[] = [];
  const window = Math.round(sampleRate * WINDOW_SECONDS);
  for (let from = 0; from + window <= overlap; from += window) {
    let expected = 0;
    for (let j = from; j < from + window; j++) expected += separate[j]!;
    const expectedDb = toDb(expected / (window * channels));
    const actualDb = toDb(mixedPower(from, from + window));
    if (expectedDb >= SILENCE_DB && actualDb < expectedDb - CANCEL_DB) {
      problems.push(
        `掉音：重叠处第 ${(from / sampleRate).toFixed(2)} 秒起曲尾和曲首互相抵消，` +
          `${actualDb.toFixed(1)} dBFS，两份各自加起来是 ${expectedDb.toFixed(1)} dBFS`,
      );
      break;
    }
  }

  const beforeDb = toDb(power(tailStart - side, tailStart));
  const afterDb = toDb(power(overlap, overlap + side));
  const overlapDb = toDb(mixedPower(0, overlap));
  const levels = `重叠前 ${beforeDb.toFixed(1)}、重叠处 ${overlapDb.toFixed(1)}、重叠后 ${afterDb.toFixed(1)} dBFS`;
  if (overlapDb < Math.min(beforeDb, afterDb) - LEVEL_DB) problems.push(`掉音：${levels}`);
  if (overlapDb > Math.max(beforeDb, afterDb) + LEVEL_DB) problems.push(`爆音：${levels}`);
  if (peak >= 1) problems.push(`爆音：重叠处削波，峰值 ${peak.toFixed(3)}`);

  const trackWindow = Math.round(sampleRate * TRACK_WINDOW_SECONDS);
  const windows: number[] = [];
  for (let from = 0; from + trackWindow <= frames; from += trackWindow) {
    windows.push(toDb(power(from, from + trackWindow)));
  }
  windows.sort((a, b) => a - b);
  const trackDb = windows[Math.floor(windows.length / 2)]!;

  return {
    beforeDb,
    overlapDb,
    afterDb,
    tailBelowTrackDb: trackDb - toDb(power(tailStart, frames)),
    headBelowTrackDb: trackDb - toDb(power(0, overlap)),
    problems,
  };
};
