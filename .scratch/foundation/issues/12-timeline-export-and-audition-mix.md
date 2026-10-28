# 12: 时间轴导出与试听拼接（默认停顿）

**What to build:** 尽早验证 spec 的第二个风险："逐句配音按停顿规则排好后，听起来是否自然"。原计划这件事排在 08 之后的 10 里，现在提前到 03 之后。

停顿规则只在 TypeScript 里定义和计算。一个 TS 命令行入口读取期目录里的合成清单（有分镜时也读分镜），调用 03 的时间轴纯函数，把结果写成期目录里的 `timeline.json`：帧率、总帧数，每个旁白句、画面、段的起止帧。Python 的试听拼接命令只读 `timeline.json`，把每句 wav 放在它的开始帧对应的时间点，句与句之间是静音，用 ffmpeg 拼成一条试听音轨（不是正式产物，写到 `out/` 下）。我用真实配音听一遍，判断默认停顿（句间 0.3 秒、换画面 0.8 秒）是否自然。

**Blocked by:** 03

**Type:** HITL（agent 做完后，我听试听音轨，决定停顿默认值是否要改）

**Status:** ready-for-agent

- [ ] TS 命令行入口（用 tsx 或 Node 自带的类型剥离运行，由实现者选）输出 `timeline.json`；它调用的就是 Remotion 里用的同一个时间轴函数
- [ ] `timeline.json` 的格式在 Python 一侧有校验；Python 里不出现停顿秒数等时间轴规则
- [ ] 试听拼接：每句 wav 从"开始帧 ÷ 帧率"秒处开始；音轨总时长与 `timeline.json` 的总时长相差不超过一帧（命令自己检查，超出就报错）
- [ ] TS 测试：同一份合成清单导出的 `timeline.json` 与直接调用时间轴函数的结果相同
- [ ] Python 测试：用假引擎生成的 wav 和一份手写的 `timeline.json` 拼接，检查总时长；`timeline.json` 格式错误时报错并指出字段
- [ ] 人工验收：用真实配音跑样例旁白稿，听试听音轨；停顿默认值要改的话，改 TS 里的默认值，并在 Comments 里记下改成了多少、为什么

## Comments

- 来自 03（2026-10-28）：时间轴函数是 `video/src/episode/timeline.ts` 的 `computeTimeline(manifest, DEFAULT_PAUSES, VIDEO.fps)`，合成清单用 `manifest.ts` 的 `parseManifest` 校验。`Timeline` 里帧区间起含止不含；每句 `endFrame` 是音频结束（不含停顿），总帧数 = 最后一句音频结束、末尾不加停顿。导出的 `timeline.json` 可以直接序列化这个结构。tsconfig 的 lib 已经是 ES2023。
- 来自 07（2026-10-28）：Python 测试里用 `FakeTtsEngine` 生成的 wav 现在 data 块后面多一个自定义 RIFF 块（记录朗读文字，给假识别引擎用）。`wave`、ffprobe、ffmpeg 都会跳过它，时长不变；拼接时如果自己按字节处理 wav，要按块解析，不要假设 data 块就是文件结尾。另外 `voice_episode` 多了必填参数 `verifier`，测试里可以用 `Verifier(FakeAsrEngine(), max_diff_rate=0, max_retries=0)`。
