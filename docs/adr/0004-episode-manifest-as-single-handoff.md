# Python 是唯一读取旁白稿的一方，用合成清单与 Remotion 交接

旁白稿（YAML）只由 Python 读取。配音完成后，Python 脚本机械地生成一份合成清单 `episode.json`：按顺序列出每个旁白句的 ID、字幕文本、音频路径和时长，以及段和画面的信息。Remotion 只读合成清单和分镜，从不直接读旁白稿。如果让两种语言各写一套解析器，格式一改，两边迟早会对不上；现在两边只在合成清单这一处交接，旁白稿的格式也只需要在 Python 这一侧维护。生成合成清单不经过模型，不花 token。

## 补充：时间轴是第二个只读交接（2026-10-28）

合成清单仍是 Python → TypeScript 方向唯一的交接。反方向另有一处：TypeScript 的时间轴导出命令（`npm run timeline`）把时间轴连同总时长报告写成期目录里的 `timeline.json`，Python 的 `pixelbook mix`（试听拼接）和 `pixelbook render`（核对帧数、打印总时长）只读它，不自己算时间轴，也不解析分镜。时间轴和总时长判断只在 TypeScript 一侧计算（Remotion 和导出命令共用 `planEpisode`），Python 原样使用里面的字段（`fps`、`totalFrames`、`lines[].id/audio/startFrame`、`duration`），这样停顿规则和分镜的停顿覆盖也只维护在一处。

## 补充：合成清单带上画面说明（2026-10-29，#32）

合成清单的每个画面多一项 `description`：旁白稿里这个画面的画面说明，Python 原样抄写，不加解析；固定片尾的画面写空串。TypeScript 一侧用它检查组件上显示的字（必须是本画面画面说明或旁白句里原样出现过的子串），Python 仍然不解析分镜。缺这一项的旧合成清单 TypeScript 拒绝读取，提示重新运行 `pixelbook voice`（配音全部命中缓存）。画面说明也进缺字检查，因为组件上的字可以取自它。
