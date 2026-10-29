// 配乐脚本共用的 ffmpeg 调用（只在本机的入库和接缝检查脚本里用，Remotion 不加载）
import { execFileSync } from "node:child_process";
import type { PcmAudio } from "./seam";

const run = (command: string, args: string[], input?: Buffer): Buffer =>
  execFileSync(command, args, { input, maxBuffer: 2 ** 31, stdio: ["pipe", "pipe", "inherit"] });

const stream = (file: string) => {
  const out = run("ffprobe", [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=sample_rate,channels,duration_ts,time_base",
    "-of", "json", file,
  ]).toString();
  const [found] = (JSON.parse(out) as {
    streams: { sample_rate: string; channels: number; duration_ts: number; time_base: string }[];
  }).streams;
  if (!found) throw new Error(`${file} 里没有音频流`);
  return found;
};

/** 用 ffprobe 量采样率和声道数（任何格式都行，MP3 的 time_base 不是采样率） */
export const audioFormat = (file: string) => {
  const { sample_rate, channels } = stream(file);
  return { sampleRate: Number(sample_rate), channels };
};

/** 用 ffprobe 量采样率、声道数和采样数（duration_ts，不用 format=duration；只用于 OGG/WAV 这类 time_base 是采样率的） */
export const probe = (file: string) => {
  const found = stream(file);
  const sampleRate = Number(found.sample_rate);
  if (found.time_base !== `1/${sampleRate}`) {
    throw new Error(`${file} 的 time_base 是 ${found.time_base}，不是 1/${sampleRate}，duration_ts 不是采样数`);
  }
  return { sampleRate, channels: found.channels, sampleCount: found.duration_ts };
};

/** 解码成交错排列的 32 位浮点采样，保持声道数；`sampleRate` 不写时保持原采样率 */
export const decode = (file: string, sampleRate = audioFormat(file).sampleRate): PcmAudio => {
  const { channels } = audioFormat(file);
  const raw = run("ffmpeg", [
    "-v", "error", "-i", file, "-ar", String(sampleRate), "-f", "f32le", "-acodec", "pcm_f32le", "-",
  ]);
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
  return { samples, channels, sampleRate };
};

export { run };
