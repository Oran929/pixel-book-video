// 选曲命令：`npm run music:pick -- <期目录>`
// 用 tsx 在 Node 里运行；相对路径按调用 npm 时的目录解析（INIT_CWD）。
import { resolve } from "node:path";
import { isCcBy, isMusicId, MUSIC } from "./tracks";
import { pickMusic } from "./pick-music";

const USAGE = "用法：npm run music:pick -- <期目录>";

const main = (argv: string[]): number => {
  const [dir, ...rest] = argv;
  if (!dir || rest.length) {
    console.error(USAGE);
    return 2;
  }
  const episodeDir = resolve(process.env.INIT_CWD ?? process.cwd(), dir);
  try {
    const { track, kept, avoided } = pickMusic(episodeDir);
    const info = isMusicId(track) ? MUSIC[track] : null;
    const about = info
      ? `（${info.title}，${info.author}，${info.license}${isCcBy(info.license) ? "，要署名：时间轴导出时写出 credits.txt" : ""}）`
      : "（没有登记：时间轴导出会报错）";
    if (kept) {
      console.log(`分镜里已经有配乐 ${track}${about}，保留不动`);
    } else {
      console.log(`已选配乐 ${track}${about}，写进 ${resolve(episodeDir, "storyboard.json")}`);
      console.log(
        avoided
          ? `避开了上一期有分镜的 ${avoided.episode} 用的 ${avoided.track}`
          : "本书在这期之前没有有分镜的一期，从全部曲子里选",
      );
    }
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  return 0;
};

process.exitCode = main(process.argv.slice(2));
