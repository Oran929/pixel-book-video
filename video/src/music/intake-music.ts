// 配乐入库（#38，#52 换成新的 8 首）：`npm run music:intake -- <下载目录>`。
// 下载目录里放着 SOURCES 列出的文件（用户给的 `Slowly Music` 目录，文件名照原样）。对每首：
// 解码（采样率高于 48 kHz 的降到 48 kHz）→ 去掉首尾静音 → 截掉曲尾不满一帧的零头 →
// oggenc 编码成 OGG/Vorbis，写到 public/music/<ID>.ogg，最后打印每首的采样率和采样数，
// 抄进登记表 tracks.ts。只在本机运行，要 ffmpeg 和 oggenc。
//
// 循环靠交叉淡化（crossfade.ts），曲尾不用接得上曲首，所以对齐到整数帧直接截掉零头
// （不到 1 帧，落在交叉淡化里）；#38 的按周期重采样是给无缝循环用的，已经去掉。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audioFormat, decode, probe, run } from "./ffmpeg";
import type { PcmAudio } from "./seam";
import { MUSIC_DIR, samplesPerFrame } from "./tracks";

/** 曲子 ID → 下载目录里的文件 */
const SOURCES: Record<string, string> = {
  ooame: "01 Ooame - TAD.mp3",
  "iced-village": "02 Iced Village - TAD.mp3",
  "the-past": "03 The Past - TAD.mp3",
  "since-2-am": "04 Since 2 AM - TAD.mp3",
  "forgotten-path": "05 Forgotten Path - johndekale.ogg",
  "slow-melancholic-theme": "06 Slow Melancholic Theme (long) - skrjablin.ogg",
  "tiny-sad-lonely-theme": "07 Tiny Sad Lonely Theme - MAOU.ogg",
  kalypo: "08 Kalypo - Spring Spring.flac",
};

/** 采样率上限：Kalypo 的 FLAC 是 96 kHz，降到 Remotion 渲染用的 48 kHz（体积减半） */
const MAX_SAMPLE_RATE = 48000;

/** oggenc 的质量档：-q 3 约 112 kbps（立体声），配乐垫在旁白下面 -20 dB，够用 */
const QUALITY = "3";

const frames = (audio: PcmAudio) => audio.samples.length / audio.channels;

/**
 * 静音的门限：-60 dBFS。每首都去掉首尾低于它的部分：MP3 解码出的编码器补的头尾静音，
 * 和曲子本身开头结尾的空白（Ooame 曲首约 0.8 秒，Iced Village 曲尾约 3 秒）
 */
const SILENCE = 10 ** (-60 / 20);

const trimSilence = (audio: PcmAudio): PcmAudio => {
  const loud = (frame: number) => {
    for (let c = 0; c < audio.channels; c++) {
      if (Math.abs(audio.samples[frame * audio.channels + c]!) > SILENCE) return true;
    }
    return false;
  };
  let first = 0;
  while (first < frames(audio) - 1 && !loud(first)) first++;
  let last = frames(audio) - 1;
  while (last > first && !loud(last)) last--;
  return { ...audio, samples: audio.samples.slice(first * audio.channels, (last + 1) * audio.channels) };
};

const [downloads] = process.argv.slice(2);
if (!downloads) {
  console.error("用法：npm run music:intake -- <下载目录>");
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "music-intake-"));
try {
  for (const [id, file] of Object.entries(SOURCES)) {
    const source = join(downloads, file);
    const { sampleRate } = audioFormat(source);
    let audio = decode(source, Math.min(sampleRate, MAX_SAMPLE_RATE));
    const original = frames(audio);
    audio = trimSilence(audio);
    const trimmed = frames(audio);
    const perFrame = samplesPerFrame(audio.sampleRate);
    const target = Math.floor(trimmed / perFrame) * perFrame;
    audio = { ...audio, samples: audio.samples.slice(0, target * audio.channels) };

    const wav = join(work, `${id}.wav`);
    run("ffmpeg", [
      "-v", "error", "-y", "-f", "f32le", "-ar", String(audio.sampleRate), "-ac", String(audio.channels),
      "-i", "-", "-c:a", "pcm_s16le", "-bitexact", "-map_metadata", "-1", wav,
    ], Buffer.from(audio.samples.buffer, audio.samples.byteOffset, audio.samples.byteLength));
    const out = new URL(`../../public/${MUSIC_DIR}/${id}.ogg`, import.meta.url).pathname;
    run("oggenc", ["-Q", "-q", QUALITY, "-o", out, wav]);

    const encoded = probe(out);
    if (encoded.sampleCount !== target) {
      throw new Error(`${id}：编码后是 ${encoded.sampleCount} 个采样，应为 ${target}`);
    }
    console.log(
      `${id}: 原 ${original} 个采样（${sampleRate} Hz），去掉首尾静音后 ${trimmed}，` +
        `截到 ${target}（${target / perFrame} 帧，${(target / audio.sampleRate).toFixed(2)} 秒），` +
        `${encoded.sampleRate} Hz，${encoded.channels} 声道`,
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
