// 生成音效（#37）：`npm run sfx`。读 public/sfx/ 里登记过的每个音效的 `<ID>.sfxr.json`
// （展开后的 jsfxr 参数），用 jsfxr 的 `sfxr.toWave` 在 Node 里生成同名 wav。
// 只在本机运行，CI 不重新生成。噪声波形（wave_type 3）用了随机数：重新生成只能做到
// 听感一致，不保证逐字节相同。
import { readFileSync, writeFileSync } from "node:fs";
import { sfxr } from "jsfxr";
import { SOUNDS } from "./sounds";

const PUBLIC = new URL("../../public/", import.meta.url);

for (const [id, file] of Object.entries(SOUNDS)) {
  const wav = new URL(file, PUBLIC);
  const params = JSON.parse(
    readFileSync(new URL(file.replace(/\.wav$/, ".sfxr.json"), PUBLIC), "utf8"),
  ) as { sample_rate: number };
  const wave = sfxr.toWave(params);
  writeFileSync(wav, Buffer.from(wave.wav));
  const seconds = (wave.data.length / params.sample_rate).toFixed(2);
  const clipped = wave.clipping ? `，削波 ${wave.clipping} 个采样` : "";
  console.log(`${id}: ${file}，${seconds} 秒${clipped}`);
}
