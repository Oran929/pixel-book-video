// 时间轴导出命令：`npm run timeline -- <期目录> [--no-storyboard] [--out <路径>]`
// 用 tsx 在 Node 里运行；相对路径按调用 npm 时的目录解析（INIT_CWD）。
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { exportTimeline, TIMELINE_FILE } from "./export-timeline";
import { segmentsText } from "./rhythm";

const USAGE =
  "用法：npm run timeline -- <期目录> [--no-storyboard] [--out <timeline.json 路径>]";

const main = (argv: string[]): number => {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        "no-storyboard": { type: "boolean", default: false },
        out: { type: "string" },
      },
    });
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    return 2;
  }
  const [dir, ...rest] = parsed.positionals;
  if (!dir || rest.length) {
    console.error(USAGE);
    return 2;
  }
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const episodeDir = resolve(cwd, dir);
  const out = resolve(
    cwd,
    parsed.values.out ?? resolve(episodeDir, TIMELINE_FILE),
  );
  try {
    const { timeline, segmentsFile, creditsFile } = exportTimeline(episodeDir, {
      storyboard: !parsed.values["no-storyboard"],
      out,
    });
    console.log(
      `已写出 ${out}：${timeline.lines.length} 句，${timeline.totalFrames} 帧` +
        `（${timeline.fps}fps，${timeline.duration.seconds.toFixed(2)} 秒）` +
        (parsed.values["no-storyboard"] ? "，未读分镜（只用默认停顿）" : ""),
    );
    console.log(
      segmentsFile
        ? `已写出打点时间表 ${segmentsFile}：${segmentsText(timeline).split("\n").length - 1} 段`
        : "未写打点时间表（只在写到期目录里的 timeline.json 时写）",
    );
    if (creditsFile) console.log(`配乐要署名，已写出 ${creditsFile}（贴进视频简介）`);
    // 样片阶段只报告，不以非零码退出
    console.log(
      `总时长 ${timeline.duration.text}：${timeline.duration.verdictText}` +
        timeline.duration.partsText,
    );
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  return 0;
};

process.exitCode = main(process.argv.slice(2));
