// 交叉淡化接缝检查（#52）：`npm run music:seams`。解码登记表里的每首曲子，照播放时的做法
// 把曲尾和曲首重叠 1 秒交叉淡化（measureCrossfade），打印一张 Markdown 表（可以直接贴进评论）。
// 有曲子掉音或爆音时以非零码退出。只在本机运行，要 ffmpeg。
import { decode } from "./ffmpeg";
import { measureCrossfade } from "./seam";
import { MUSIC } from "./tracks";

const PUBLIC = new URL("../../public/", import.meta.url);

const rows = [
  "| 曲子 | 重叠前 1 秒 / 重叠处 / 重叠后 1 秒（dBFS） | 重叠里的曲尾 / 曲首比整首轻（dB） | 结果 |",
  "| --- | --- | --- | --- |",
];
const failed: string[] = [];
for (const [id, track] of Object.entries(MUSIC)) {
  const seam = measureCrossfade(decode(new URL(track.file, PUBLIC).pathname));
  rows.push(
    `| ${id} | ${seam.beforeDb.toFixed(1)} / ${seam.overlapDb.toFixed(1)} / ${seam.afterDb.toFixed(1)} | ` +
      `${seam.tailBelowTrackDb.toFixed(1)} / ${seam.headBelowTrackDb.toFixed(1)} | ` +
      `${seam.problems.length === 0 ? "不掉音、不爆音" : seam.problems.join("；")} |`,
  );
  if (seam.problems.length > 0) failed.push(id);
}
console.log(rows.join("\n"));
if (failed.length > 0) {
  console.error(`\n交叉淡化处有问题：${failed.join("、")}`);
  process.exit(1);
}
