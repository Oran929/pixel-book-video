// 时间轴导出命令：`npm run timeline -- <期目录> [--no-storyboard] [--out <路径>]`
// 用 tsx 在 Node 里运行；相对路径按调用 npm 时的目录解析（INIT_CWD）。
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { exportTimeline, TIMELINE_FILE } from "./export-timeline";

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
    const timeline = exportTimeline(episodeDir, {
      storyboard: !parsed.values["no-storyboard"],
      out,
    });
    // 票 10 在这里加：写打点时间表 segments.txt，报告总时长（m:ss）和 4:00–6:00 的判断
    console.log(
      `已写出 ${out}：${timeline.lines.length} 句，${timeline.totalFrames} 帧` +
        `（${timeline.fps}fps，${(timeline.totalFrames / timeline.fps).toFixed(2)} 秒）` +
        (parsed.values["no-storyboard"] ? "，未读分镜（只用默认停顿）" : ""),
    );
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  return 0;
};

process.exitCode = main(process.argv.slice(2));
