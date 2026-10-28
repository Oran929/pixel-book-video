# 12: 时间轴导出与试听拼接（默认停顿）

**What to build:** 尽早验证 spec 的第二个风险："逐句配音按停顿规则排好后，听起来是否自然"。原计划这件事排在 08 之后的 10 里，现在提前到 03 之后。

停顿规则只在 TypeScript 里定义和计算。一个 TS 命令行入口读取期目录里的合成清单（有分镜时也读分镜），调用 03 的时间轴纯函数，把结果写成期目录里的 `timeline.json`：帧率、总帧数，每个旁白句、画面、段的起止帧。Python 的试听拼接命令只读 `timeline.json`，把每句 wav 放在它的开始帧对应的时间点，句与句之间是静音，用 ffmpeg 拼成一条试听音轨（不是正式产物，写到 `out/` 下）。我用真实配音听一遍，判断默认停顿（句间 0.3 秒、换画面 0.8 秒）是否自然。

**Blocked by:** 03

**Type:** HITL（agent 做完后，我听试听音轨，决定停顿默认值是否要改）

**Status:** ready-for-agent

- [x] TS 命令行入口（用 tsx 或 Node 自带的类型剥离运行，由实现者选）输出 `timeline.json`；它调用的就是 Remotion 里用的同一个时间轴函数
- [x] `timeline.json` 的格式在 Python 一侧有校验；Python 里不出现停顿秒数等时间轴规则
- [x] 试听拼接：每句 wav 从"开始帧 ÷ 帧率"秒处开始；音轨总时长与 `timeline.json` 的总时长相差不超过一帧（命令自己检查，超出就报错）
- [x] TS 测试：同一份合成清单导出的 `timeline.json` 与直接调用时间轴函数的结果相同
- [x] Python 测试：用假引擎生成的 wav 和一份手写的 `timeline.json` 拼接，检查总时长；`timeline.json` 格式错误时报错并指出字段
- [ ] 人工验收：用真实配音跑样例旁白稿，听试听音轨；停顿默认值要改的话，改 TS 里的默认值，并在 Comments 里记下改成了多少、为什么

## Comments

- 来自 03（2026-10-28）：时间轴函数是 `video/src/episode/timeline.ts` 的 `computeTimeline(manifest, DEFAULT_PAUSES, VIDEO.fps)`，合成清单用 `manifest.ts` 的 `parseManifest` 校验。`Timeline` 里帧区间起含止不含；每句 `endFrame` 是音频结束（不含停顿），总帧数 = 最后一句音频结束、末尾不加停顿。导出的 `timeline.json` 可以直接序列化这个结构。tsconfig 的 lib 已经是 ES2023。
- 来自 07（2026-10-28）：Python 测试里用 `FakeTtsEngine` 生成的 wav 现在 data 块后面多一个自定义 RIFF 块（记录朗读文字，给假识别引擎用）。`wave`、ffprobe、ffmpeg 都会跳过它，时长不变；拼接时如果自己按字节处理 wav，要按块解析，不要假设 data 块就是文件结尾。另外 `voice_episode` 多了必填参数 `verifier`，测试里可以用 `Verifier(FakeAsrEngine(), max_diff_rate=0, max_retries=0)`。
- 来自 08（2026-10-28）：分镜的停顿覆盖要这样传进时间轴：`parseStoryboard(data, manifest, COMPONENT_SCHEMAS)` 校验，再 `computeTimeline(manifest, DEFAULT_PAUSES, VIDEO.fps, pauseOverrides(storyboard))`（都在 `video/src/episode/storyboard.ts`、`timeline.ts`）。注意 `COMPONENT_SCHEMAS` 来自 `video/src/components/registry.ts`，它会 import 组件的 .tsx 和 `remotion`；命令行入口如果不想加载 React，可以把各组件的参数 schema 拆到不含 JSX 的文件里，或者只为停顿覆盖传一个跳过组件核对的注册表（后者会漏报组件错误，不推荐）。期目录里分镜文件名是 `storyboard.json`，可以没有。
- 实现记录（2026-10-28）：
  - **命令**：`cd video && npm run timeline -- <期目录> [--no-storyboard] [--out <路径>]`（`tsx src/episode/timeline-cli.ts`，加了 devDependency `tsx`；相对路径按调用 npm 的目录 `INIT_CWD` 解析，所以在仓库根目录用 `npm --prefix video run timeline -- books/...` 也行）；`cd tools && uv run pixelbook mix <timeline.json> [--out <wav>]`，默认写到 `out/mix/<书>-<章>-<期>.wav`。
  - **选 tsx 而不用 Node 自带的类型剥离**：现有代码的 import 不带 `.ts` 扩展名，Node 的类型剥离要求写扩展名（还要开 `allowImportingTsExtensions`），等于改动全部 import；tsx 直接可用。
  - **组件参数格式拆到 `video/src/components/schemas.ts`**（按 08 的建议）：导出命令校验分镜要用组件注册表，原来的 `registry.ts` 会加载 .tsx 和 remotion。现在 `schemas.ts` 只有 zod 格式（`COMPONENT_SCHEMAS` 从这里导出），`registry.ts` 只放实现，两处的组件名由类型约束一致。分镜校验仍走完整的 `parseStoryboard`（不跳过组件核对）。
  - **接缝（测试位置）**：TS 测 `exportTimeline(期目录, { storyboard?, out? })`（`video/src/episode/export-timeline.ts`），比较写出的文件和直接调用 `computeTimeline` 的结果（无分镜、有分镜停顿覆盖、`storyboard: false`、分镜不合格时报错）；命令行外壳 `timeline-cli.ts` 很薄，没有单独测。Python 测 `mix_timeline(timeline.json, public 目录, 输出)`（`tools/src/pixelbook/mix.py`）和 `pixelbook mix` 命令。TDD 技能要求先和用户确认接缝；这次是 agent 独立完成，按票面写的测试项选了这两个公开入口，没有另外确认。
  - **`timeline.json` 的格式**：直接序列化 03 的 `Timeline`（`fps`、`totalFrames`、`lines`/`scenes`/`segments` 各带 `startFrame`、`endFrame`，旁白句还带合成清单里的字段，含 `audio`）。Python 只校验拼接用到的字段（`fps` 正整数、`totalFrames` 非负整数、`lines` 非空、每句 `id`/`audio` 字符串、`startFrame` 非负整数），其余字段不管，所以票 10 往里加字段不用改 Python。`timeline.json` 是生成物，加进了 `.gitignore`。
  - **wav 从哪里读**：`timeline.json` 里的 `audio` 以 `video/public/` 为起点，`mix` 读 `video/public/episode/` 里 `voice` 复制过去的 wav（不读书的缓存，Python 也不用重新算哪句对应哪个缓存）。所以要在对同一期 `voice` 之后导出、拼接；找不到 wav 时报错并说明这一点。
  - **拼接方式**：ffmpeg 每句 `adelay`（按采样数延迟，采样率取第一句 wav 的）、`amix normalize=0`（句子不重叠，原样叠加不降音量）、`apad` 补到总时长，不截断；拼完量时长，和 `totalFrames / fps` 相差超过一帧就报错（比如时间轴是旧配音导出的）。`--no-storyboard` 是为了单独听默认停顿加的选项（票面没写）。
  - **试听音轨（人工验收用，真实配音，没有重新跑 TTS，`voice.lock` 未动）**：用样例书现有的真实配音（`video/public/episode/` 里的 wav 与 `books/sample/cache/tts/` 一致，合成清单相同）导出：
    - 带分镜（s01-l04 之后的停顿覆盖为 1.2 秒）：`out/mix/sample-ch01-ep01.wav`，18.83 秒（565 帧，与 08 渲染的帧数相同）；
    - 不带分镜（纯默认停顿：句间 0.3 秒、换画面 0.8 秒）：`out/mix/sample-ch01-ep01-default-pauses.wav`，18.43 秒（553 帧），时间轴在 `out/mix/sample-ch01-ep01-default-pauses.timeline.json`。
    - 样例里能听到的停顿：s01-l01→l02、l03→l04、s02 内各句之间是句间停顿；s01-l02→l03 是换画面；s01-l04→s02-l01 是换段（默认 0.8 秒，带分镜那条是 1.2 秒）。
    - 自己重跑（仓库根目录）：
      ```sh
      cd video
      npm run timeline -- ../books/sample/ch01/ep01
      npm run timeline -- ../books/sample/ch01/ep01 --no-storyboard --out ../out/mix/sample-ch01-ep01-default-pauses.timeline.json
      cd ../tools
      uv run pixelbook mix ../books/sample/ch01/ep01/timeline.json
      uv run pixelbook mix ../out/mix/sample-ch01-ep01-default-pauses.timeline.json --out ../out/mix/sample-ch01-ep01-default-pauses.wav
      ```
    - 改停顿默认值：改 `video/src/episode/timeline.ts` 的 `DEFAULT_PAUSES`，再跑上面四条命令即可（不用重新配音）。

