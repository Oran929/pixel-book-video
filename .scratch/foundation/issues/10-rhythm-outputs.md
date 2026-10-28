# 10: 节奏产物：打点时间表、时长报告

**What to build:** 在 12 的时间轴导出命令上，再输出两样东西：打点时间表（每段一行，`00:00 段标题`），可以直接复制到视频平台的分段设置里；一期的总时长报告，并按 4:00–6:00 的范围判断（样片阶段只报告，不阻止）。08 加入的分镜停顿覆盖，会自动反映在 `timeline.json`、打点时间表和 12 的试听音轨里，因为它们都来自同一个时间轴。

**Blocked by:** 08、12

**Type:** AFK

**Status:** done

**分工说明（2026-10-28 审查后修改）：** 停顿规则只在 TypeScript 里定义和计算（原来写在这张票里的"停顿规则只定义一次"和试听拼接，已经提前到 12）。总时长包含停顿，只有时间轴知道，所以总时长报告也由 TS 的时间轴导出命令输出，不放在 Python 的配音检查报告里。

**验收：**

- [x] 时间轴导出命令同时写出期目录里的 `segments.txt`：每段一行，时间是该段的开始帧换算成秒后**向下取整**；不到 1 小时用 `mm:ss`，超过 1 小时用 `h:mm:ss`；第一段永远是 `00:00`
- [x] 时间轴导出命令输出总时长（`m:ss`），并给出判断：在 4:00–6:00 之内 / 太短 / 太长；判断结果也写进 `timeline.json`。样片阶段只报告，不以非零码退出
- [x] 总时长报告的数值与时间轴的总帧数换算结果一致
- [x] 有分镜停顿覆盖时，`timeline.json` 和试听音轨都反映了覆盖（试听音轨时长仍与时间轴相差不超过一帧）
- [x] TS 测试覆盖：打点时间表的格式（含 59:59、1:00:00 两个边界）和时间、向下取整、总时长的范围判断（3:59、4:00、6:00、6:01）

## Comments

- 来自 12（2026-10-28）：时间轴导出命令已经有了，结构上给这张票留了位置：
  - 逻辑在 `video/src/episode/export-timeline.ts` 的 `exportTimeline(期目录, { storyboard?, out? })`，它读合成清单和分镜、算时间轴、写 `timeline.json` 并返回 `Timeline`。打点时间表 `segments.txt` 建议在这里一并写到期目录（`timeline.segments` 已有每段 `startFrame`、`title`），格式化和范围判断写成纯函数，方便测边界值。
  - 命令行外壳 `video/src/episode/timeline-cli.ts` 的打印处有一行注释"票 10 在这里加"：总时长（`m:ss`）和 4:00–6:00 的判断从这里打印；样片阶段只报告，保持退出码 0。
  - 判断结果要写进 `timeline.json`：直接在 `Timeline` 外再包一层或加一个字段都行，Python 的 `pixelbook mix` 只校验 `fps`、`totalFrames`、`lines[].id/audio/startFrame`，多出来的字段不影响它。不要改这几个字段的名字。
  - `--no-storyboard --out <路径>` 写到期目录以外时，`segments.txt` 写不写、写到哪里需要定一下（建议：只在默认输出到期目录时写，或者跟着 `--out` 的目录走）。
  - 验收第 4 项"有分镜停顿覆盖时，`timeline.json` 和试听音轨都反映了覆盖"在 12 里已经成立（`exportTimeline` 的测试覆盖了停顿覆盖；样例的两条试听音轨 565 帧 / 553 帧，相差正是 s01-l04 之后 1.2 秒对 0.8 秒的 12 帧）。
- 来自 10（2026-10-28，实现记录）：
  - 纯函数在 `video/src/episode/rhythm.ts`：`formatSegmentStart`（向下取整，不到 1 小时 `mm:ss`，否则 `h:mm:ss`）、`segmentsText`（每段一行 `00:00 段标题`，末尾换行）、`durationReport`（`seconds` 不取整、`text` 为 `m:ss` 向下取整、`verdict` 为 `within` / `too-short` / `too-long`）。测试在 `rhythm.test.ts`，覆盖 59:59 / 1:00:00 边界、向下取整、3:59 / 4:00 / 6:00 / 6:01。
  - 决定：范围判断按**显示出来的整秒**判断，两端都算在范围内。这样 6:00.9 显示 6:00 判为在范围内，不会出现"6:00 太长"这种自相矛盾的输出；代价是实际最多可以比 6:00 长不到 1 秒。
  - 决定：`timeline.json` 加一个顶层字段 `duration: { seconds, text, verdict }`，`fps`、`totalFrames`、`lines[].id/audio/startFrame` 都没改；`pixelbook mix` 用新文件实测通过（18.83 秒）。
  - 决定（`--out` 与 `segments.txt`）：只在 `timeline.json` 写到期目录里的默认位置时才写 `segments.txt`（同在期目录）；`--out` 写到别处时不写，命令打印一行"未写打点时间表"。理由：写到别处的基本是试听默认停顿用的时间轴，不应该覆盖或冒充正式的打点时间表，也避免在 `out/mix/` 里堆一个不知道属于哪期的 `segments.txt`。`--no-storyboard` 不带 `--out` 时仍写期目录，`segments.txt` 与该 `timeline.json` 一致。
  - `exportTimeline` 的返回值改成 `{ timeline, segmentsFile }`（`segmentsFile` 不写时为 `null`），`timeline` 带 `duration`。
  - `segments.txt` 加进 `.gitignore`（与 `timeline.json` 一样是生成物）。
  - 样例实测：`00:00 开场` / `00:11 为什么`，总时长 0:18，太短（目标 4:00–6:00），退出码 0。
