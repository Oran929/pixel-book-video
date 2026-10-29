// 配乐入库（#38）：`npm run music:intake -- <下载目录>`。
// 下载目录里每首曲子一个子目录（见 SOURCES）。对每首：解码 → 按需处理 →
// 采样数对齐到一帧的整数倍 → oggenc 编码成 OGG/Vorbis，写到 public/music/<ID>.ogg，
// 最后打印每首的采样率和采样数，抄进登记表 tracks.ts。只在本机运行，要 ffmpeg 和 oggenc。
//
// 对齐用的是**按周期重采样**（stretch.ts），不是裁剪或补零：曲子整体快慢变化不到 0.05%
// （听不出来），循环长度变成整数帧，接缝处仍是曲尾接曲首。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decode, probe, run } from "./ffmpeg";
import type { PcmAudio } from "./seam";
import { stretchLoop } from "./stretch";
import { MUSIC_DIR, samplesPerFrame } from "./tracks";

type Source = {
  /** 下载目录里的相对路径 */
  file: string;
  /** 去掉首尾低于 -60 dBFS 的静音（arcade background music：曲首约 46 毫秒、曲尾约 1.7 秒） */
  trimSilence?: boolean;
};

const SOURCES: Record<string, Source> = {
  "flowerbed-fields": { file: "flowerbed-fields/flowerbed_fields.wav" },
  "sideways-city": { file: "sideways-city/sideways_city_loop.wav" },
  "starlight-city": { file: "starlight-city/starlight_city_loop.wav" },
  "pixel-sprinter": { file: "pixel-sprinter/pixel_sprinter_loop.wav" },
  "the-arplands": { file: "the-arplands/the_arplands.wav" },
  "lasso-lady": { file: "lasso-lady/lassolady.ogg" },
  "arcade-background-music": { file: "arcade-background-music/arcade_song.wav", trimSilence: true },
  "delayed-chiptune": { file: "delayed-chiptune/delayed_chips.ogg" },
};

/** oggenc 的质量档：-q 3 约 112 kbps（立体声），配乐垫在旁白下面 -20 dB，够用 */
const QUALITY = "3";

const frames = (audio: PcmAudio) => audio.samples.length / audio.channels;

/** 静音的门限：-60 dBFS */
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
  for (const [id, source] of Object.entries(SOURCES)) {
    let audio = decode(join(downloads, source.file));
    const original = frames(audio);
    if (source.trimSilence) audio = trimSilence(audio);
    const perFrame = samplesPerFrame(audio.sampleRate);
    const target = Math.round(frames(audio) / perFrame) * perFrame;
    const trimmed = frames(audio);
    audio = stretchLoop(audio, target);

    const wav = join(work, `${id}.wav`);
    run("ffmpeg", [
      "-v", "error", "-y", "-f", "f32le", "-ar", String(audio.sampleRate), "-ac", String(audio.channels),
      "-i", "-", "-c:a", "pcm_s16le", "-bitexact", "-map_metadata", "-1", wav,
    ], Buffer.from(audio.samples.buffer));
    const out = new URL(`../../public/${MUSIC_DIR}/${id}.ogg`, import.meta.url).pathname;
    run("oggenc", ["-Q", "-q", QUALITY, "-o", out, wav]);

    const encoded = probe(out);
    if (encoded.sampleCount !== target) {
      throw new Error(`${id}：编码后是 ${encoded.sampleCount} 个采样，应为 ${target}`);
    }
    console.log(
      `${id}: 原 ${original} 个采样，处理后 ${trimmed}，对齐到 ${target}（${target / perFrame} 帧，` +
        `${((target / trimmed - 1) * 100).toFixed(3)}%），${encoded.sampleRate} Hz，${encoded.channels} 声道`,
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
