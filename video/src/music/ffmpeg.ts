// 配乐脚本共用的 ffmpeg 调用（只在本机的入库和接缝检查脚本里用，Remotion 不加载）
import { execFileSync } from "node:child_process";
import type { PcmAudio } from "./seam";

const run = (command: string, args: string[], input?: Buffer): Buffer =>
  execFileSync(command, args, { input, maxBuffer: 2 ** 31, stdio: ["pipe", "pipe", "inherit"] });

/** 用 ffprobe 量采样率、声道数和采样数（duration_ts，不用 format=duration） */
export const probe = (file: string) => {
  const out = run("ffprobe", [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=sample_rate,channels,duration_ts,time_base",
    "-of", "json", file,
  ]).toString();
  const [stream] = (JSON.parse(out) as {
    streams: { sample_rate: string; channels: number; duration_ts: number; time_base: string }[];
  }).streams;
  if (!stream) throw new Error(`${file} 里没有音频流`);
  const sampleRate = Number(stream.sample_rate);
  if (stream.time_base !== `1/${sampleRate}`) {
    throw new Error(`${file} 的 time_base 是 ${stream.time_base}，不是 1/${sampleRate}，duration_ts 不是采样数`);
  }
  return { sampleRate, channels: stream.channels, sampleCount: stream.duration_ts };
};

/** 解码成交错排列的 32 位浮点采样，保持原采样率和声道数 */
export const decode = (file: string): PcmAudio => {
  const { sampleRate, channels } = probe(file);
  const raw = run("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-acodec", "pcm_f32le", "-"]);
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
  return { samples, channels, sampleRate };
};

export { run };
