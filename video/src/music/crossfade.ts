// 配乐的循环排期（#52）：曲子比正片短时循环播放，每个接缝处曲尾和下一次的曲首重叠
// CROSSFADE_FRAMES 帧做交叉淡化。纯函数，不引用 remotion：EpisodeMusic 播放和时间轴导出
// （全长试验用它造参照）共用。
import type { MusicPlan } from "../episode/episode-plan";
import { VOLUME } from "../style/volume";

/** 交叉淡化重叠的帧数（30fps 下 1 秒，spec #16 修订三） */
export const CROSSFADE_FRAMES = 30;

/** 帧区间 [from, to) */
export type FrameSpan = { from: number; to: number };

/**
 * 一次循环：从第 `from` 帧放到第 `to` 帧（不含；最后一次在正文结束处截断），
 * `fadeIn` 是和上一次重叠、淡入的那几帧，`fadeOut` 是和下一次重叠、淡出的那几帧（没有为 null）
 */
export type MusicPlay = { from: number; to: number; fadeIn: FrameSpan | null; fadeOut: FrameSpan | null };

/**
 * 从 `startFrame` 到 `endFrame` 排出每次循环。曲长 `trackFrames` 不短于正片时只放一次；
 * 否则每次比上一次晚 `trackFrames − CROSSFADE_FRAMES` 帧开始，直到下一次的起点到了正文结束。
 */
export const musicPlays = (music: MusicPlan, trackFrames: number): MusicPlay[] => {
  if (trackFrames <= 2 * CROSSFADE_FRAMES) {
    throw new Error(
      `曲子只有 ${trackFrames} 帧，循环要比两段交叉淡化（${2 * CROSSFADE_FRAMES} 帧）长`,
    );
  }
  const step = trackFrames - CROSSFADE_FRAMES;
  const plays: MusicPlay[] = [];
  for (let from = music.startFrame; from < music.endFrame; from += step) {
    const overlap = (start: number) => ({ from: start, to: start + CROSSFADE_FRAMES });
    const next = from + step;
    const loops = from + trackFrames < music.endFrame;
    plays.push({
      from,
      to: Math.min(from + trackFrames, music.endFrame),
      fadeIn: plays.length > 0 ? overlap(from) : null,
      fadeOut: loops ? overlap(next) : null,
    });
    if (!loops) break;
  }
  return plays;
};

/**
 * 交叉淡化的第 `k` 帧（共 `frames` 帧）淡入、淡出的增益：等功率曲线 sin、cos，
 * 取帧中点，第一帧不是 0、最后一帧不是 1，两者平方和处处是 1
 */
export const fadeInGain = (k: number, frames: number): number =>
  Math.sin((Math.PI / 2) * ((k + 0.5) / frames));
export const fadeOutGain = (k: number, frames: number): number =>
  Math.cos((Math.PI / 2) * ((k + 0.5) / frames));

const inside = (span: FrameSpan | null, frame: number): span is FrameSpan =>
  span !== null && frame >= span.from && frame < span.to;

/**
 * 第 `frame` 帧（整期的帧数）这次循环的线性音量：配乐音量 `VOLUME.music`，乘上交叉淡化
 * （等功率：淡入 sin、淡出 cos，重叠处两份的功率加起来不变），再乘上正文最后的线性淡出
 * （`fadeFrom` 到 `endFrame` 降到 0）。
 */
export const musicVolume = (music: MusicPlan, play: MusicPlay, frame: number): number => {
  let gain = VOLUME.music;
  const { fadeIn, fadeOut } = play;
  if (inside(fadeIn, frame)) gain *= fadeInGain(frame - fadeIn.from, fadeIn.to - fadeIn.from);
  if (inside(fadeOut, frame)) gain *= fadeOutGain(frame - fadeOut.from, fadeOut.to - fadeOut.from);
  if (frame >= music.fadeFrom) {
    gain *= Math.max(0, (music.endFrame - frame) / (music.endFrame - music.fadeFrom));
  }
  return gain;
};
