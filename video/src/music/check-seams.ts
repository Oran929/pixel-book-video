// 循环接缝检查（#38）：`npm run music:seams`。解码登记表里的每首曲子，把曲尾接回曲首，
// 用 measureSeam 量接缝处的采样差和 RMS 跳变，打印一张 Markdown 表（可以直接贴进评论）。
// 量出来的结果和登记表的 seamless 不一致时以非零码退出。只在本机运行，要 ffmpeg。
import { decode } from "./ffmpeg";
import { measureSeam } from "./seam";
import { MUSIC } from "./tracks";

const PUBLIC = new URL("../../public/", import.meta.url);

const rows = [
  "| 曲子 | 接缝采样差 | 两侧相邻采样最大差 | RMS 曲尾 → 曲首（dBFS） | 结果 | 登记 |",
  "| --- | --- | --- | --- | --- | --- |",
];
const mismatched: string[] = [];
for (const [id, track] of Object.entries(MUSIC)) {
  const seam = measureSeam(decode(new URL(track.file, PUBLIC).pathname));
  const result = seam.seamless ? "无缝" : `不无缝：${seam.problems.join("；")}`;
  rows.push(
    `| ${id} | ${seam.jump.toFixed(4)} | ${seam.localDiff.toFixed(4)} | ` +
      `${seam.tailDb.toFixed(1)} → ${seam.headDb.toFixed(1)} | ${result} | ${track.seamless ? "无缝" : "不无缝"} |`,
  );
  if (seam.seamless !== track.seamless) mismatched.push(id);
}
console.log(rows.join("\n"));
if (mismatched.length > 0) {
  console.error(`\n登记表的 seamless 和量出来的不一致：${mismatched.join("、")}`);
  process.exit(1);
}
