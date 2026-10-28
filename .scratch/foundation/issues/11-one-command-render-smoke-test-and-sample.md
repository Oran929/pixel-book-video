# 11: 一键渲染、冒烟测试与样片验收

**What to build:** 一条命令完成"跑配音流水线（含复制到 Remotion 静态目录）→ 导出时间轴、打点时间表和总时长 → 渲染 MP4 → 汇总检查报告"。冒烟测试用一份固定的小样例真实渲染一次，检查 MP4 时长与计算时长相差不超过一帧。最后用 02 选定的默认音色，产出约 20 秒的样片，交给我整体验收。这标志着"音频驱动画面"已经被证实。

**Blocked by:** 06、07、09、10

**Type:** HITL（我做最终验收）

**Status:** ready-for-agent

- [x] 一键命令在任何一步失败时都会停下，并指出是哪一步、原因是什么
- [x] 冒烟测试是一条单独的命令，不放进每次都跑的统一检查（`make check`）里
- [x] 冒烟测试用假 TTS 引擎（静音 wav）和假语音识别引擎，加上一份固定的小样例旁白稿，不加载任何真实模型；它验证的是"渲染管线和时长"，不是音质
- [x] 冒烟测试用 ffprobe 读 MP4 **视频流**的帧数，与 `timeline.json` 的总帧数比较，相差不超过一帧；不比较音频流时长（最后一句的音频可能比视频短）
- [ ] 样片：默认音色、字幕逐句同步、组件在指定的旁白句出现、风格表和频道形象初版都生效
- [x] README 写明从旁白稿到 MP4 的完整操作步骤
- [ ] 人工验收：我验收样片后，写一份简短回顾，记下哪些假设被推翻、哪些需要调整，作为阶段 3–4 spec 的输入

## Comments

- 来自 03（2026-10-28）：渲染命令是 `cd video && npm run render -- <输出路径>`（即 `remotion render Episode`）。合成 ID 是 `Episode`，总帧数由 `calculateMetadata` 读 `video/public/episode/episode.json` 后算出，没有这个文件时渲染会报错并提示先运行 `pixelbook voice` / `stage`。03 的实测：样例 7 句渲染 673 帧，约 23 秒（M5 Max）。
- 来自 06（2026-10-28）：`voice_episode` 多了 `revoice` 参数，音色和书的 `voice.lock` 不一致时抛 `PipelineError`（一键命令应把它当作"配音"这一步失败报出来，并把 `--revoice` 透传）。冒烟测试的固定小样例如果放在一本书目录下，首次运行会写 `voice.lock`；用临时目录或忽略它，不要污染 `books/sample/voice.lock`。样例书的 `voice.lock` 已按当前 `voice.yaml`（tianmei）写好，改默认音色后出样片需要 `--revoice`。`--revoice` 目前只重配指定的一期，如果一键命令要支持"整本书重配"，需要定一期上屏到 `video/public/episode/`。
- 来自 07（2026-10-28）：
  - `voice_episode` 多了必填参数 `verifier`（`pixelbook.verification.Verifier(asr, max_diff_rate, max_retries)`），CLI 从仓库根目录的 `verification.yaml` 读设置，用 `pixelbook.mlx_asr.MlxAsrEngine(name)` 做真实识别。冒烟测试用 `Verifier(FakeAsrEngine(), ...)`；`FakeAsrEngine` 只认 `FakeTtsEngine` 生成的 wav（wav 末尾有一个记录文字的自定义 RIFF 块，音频仍是静音，ffprobe/ffmpeg 正常读取，Remotion 里浏览器播放应当也会跳过它，但没验证过）。
  - 检查报告是期目录里的 `report.json`，目前只有 `asr_failures`（复核未通过的句子：`id`、`text`、`spoken`、`heard`、`diff_rate`、`cache`）。复核未通过**不是**失败：`voice` 仍以 0 退出，合成清单照常可用；一键命令汇总报告时把它列出来，不要因此停下。
  - 真实运行时识别模型在第一次识别时才加载（整期命中缓存时不加载）；样例 7 句全新配音加复核约 8–10 秒（M5 Max）。
- 来自 08（2026-10-28）：`voice` / `stage` 现在也复制期目录里的 `storyboard.json`（没有就删掉旧的）；Remotion 在 `calculateMetadata` 里校验分镜，出错时 `remotion render` 失败并列出第几个画面、第几个触发。冒烟测试的小样例建议带一份分镜，同时覆盖"分镜对真实合成清单校验通过、组件区间不越界"——08 没有这条自动测试，因为 `episode.json` 不提交。样例书现在有分镜和一处停顿覆盖，用当前缓存渲染是 565 帧（18.83 秒），已渲染到 `out/sample-ch01-ep01.mp4`。
- 来自 07（2026-10-28，复核改为两步）：`report.json` 现在有两个键：`asr_failures`（每项多了 `pinyin_diff_rate`，旧缓存的句子为 `null`）和 `asr_pinyin_passes`（比字不通过、靠不带声调的拼音通过的句子，多半是同音字，算通过，字段同 `asr_failures`）。汇总时 `asr_pinyin_passes` 只列出备查，不算问题。
- 来自 12（2026-10-28）：时间轴导出是 `cd video && npm run timeline -- <期目录>`（tsx 运行 `src/episode/timeline-cli.ts`，失败时退出码 1、错误打到 stderr；参数错 2），写期目录里的 `timeline.json`；它和 Remotion 用同一个时间轴函数和分镜校验，所以一键命令可以把它放在渲染之前当作"分镜校验"一步，比等 `remotion render` 报错更早。冒烟测试比对的 `totalFrames` 就从这个文件读。试听音轨 `uv run pixelbook mix <timeline.json>` 不是正式产物，一键命令不必调用。相对路径按调用 npm 的目录解析（`INIT_CWD`），从仓库根目录可以用 `npm --prefix video run timeline -- books/...`。
- 来自 10（2026-10-28）：`npm run timeline` 现在同时写出期目录里的打点时间表 `segments.txt`，并在最后一行打印 `总时长 m:ss：在 4:00–6:00 之内 / 太短 / 太长`；判断也在 `timeline.json` 的 `duration.verdict`（`within` / `too-short` / `too-long`），一键命令汇总报告时可以直接读这个字段，不用解析输出文本。总时长超出范围时退出码仍是 0，一键命令不要因此停下（约 20 秒的样片必然是"太短"）。只有写到期目录默认位置时才写 `segments.txt`，用 `--out` 写到别处时不写。
- 来自 09（2026-10-28）：
  - `voice` 现在还做缺字检查：字幕里有字体没有的字时，报告 `report.json` 多一项 `missing_glyphs: [{id, char}]`，`voice` **以退出码 1 结束**（合成清单照常写出）。一键命令应把它当作"配音"这一步失败报出来。`voice_episode` 的新参数 `font`（CLI 传 `video/public/fonts/…woff2`）；冒烟测试直接调 `voice_episode` 时也传上，才会检查缺字。
  - `Root.tsx` 现在有两个合成：`Episode` 和风格样张 `StyleSheet`。一键命令渲染时要明确写 `Episode`（`npm run render` 已经是 `remotion render Episode`）。
  - 中间帧改成了 PNG，渲染会比 JPEG 慢一点、MP4 没变大多少（样例 1.1 MB）。字体在第一帧前用 `delayRender` 加载，冒烟测试不需要特别处理。
- 来自 09（2026-10-28）：旁白稿顶层多了必填字段 `title`（这一期的书名或主题名，显示在画面左上角，缺了 `voice` 报错）。冒烟测试的固定小样例旁白稿要带上它。合成清单 `episode.json` 也多了顶层 `title`，TS 校验要求非空。验收项"风格表和频道形象初版都生效"里的频道形象，现在指左上角的书名/主题名（不再是写死的频道名），小人按用户意见不常驻画面。
- 来自 11 实现（2026-10-28）：
  - 一键命令是 `uv run pixelbook render <旁白稿> [--out <mp4>] [--revoice]`（`tools/src/pixelbook/render.py` 的 `render_episode`），默认输出 `out/<书>-<章>-<期>.mp4`。四步：配音 → 时间轴（`npm --prefix video run timeline`）→ 渲染（`npx remotion render Episode`）→ 核对时长（ffprobe 数视频流帧数，和 `timeline.json` 的 `totalFrames` 比，相差超过一帧算失败）。任何一步失败抛 `RenderError`，打印"第 N 步「步名」失败：原因"，退出码 1；外部命令失败时附上它输出的最后 30 行。读配置出错（`verification.yaml`、`voice.yaml`、读音表）、新术语、音色锁定不一致、缺字都算"配音"一步失败；`--revoice` 原样透传给 `voice_episode`。`asr_failures`、`duration.verdict` 不让命令失败，只列进汇总；`asr_pinyin_passes` 只列句子 ID 备查。
  - 汇总报告只打印，不另写文件（`report.json`、`timeline.json`、`segments.txt` 已经在期目录里）。汇总里不重复写 4:00–6:00 这个数，只说"在目标范围之内 / 太短 / 太长"，范围只在 TS 的 `DURATION_RANGE` 一处定义。
  - 冒烟测试：`make smoke`（`cd tools && uv run pytest smoke`）。测试放在 `tools/smoke/`，不在 pytest 的 `testpaths`（`tests`）里，所以 `make check` 不跑它；ruff 照常检查它。固定小样例在 `tools/smoke/episode/`（4 句、2 段 3 个画面、`title`、分镜两个组件一处停顿覆盖）。它经 `cli.main(["render", ...])` 走一键命令本身，把 `QwenTtsEngine` / `MlxAsrEngine` 换成假引擎，仓库根目录换成临时目录（`voice.yaml` 用假的预设音色，不需要参考音频），所以配音缓存和 `voice.lock` 写在临时的书目录里，不碰 `books/sample/voice.lock`。Remotion 静态目录也换成临时目录：复制 `video/public/`（字体、小人图）但不带 `episode/`，渲染时传 `--public-dir`，所以冒烟测试不会覆盖上屏的那一期。断言：退出码 0、`totalFrames` 在 225–232（按假 TTS 每字 0.2 秒和停顿手算约 228）、ffprobe **解码**数出的视频流帧数和 `totalFrames` 相差不超过一帧、`segments.txt` 两行、`verdict` 为 `too-short`。本机（M5 Max）约 3.5 秒（Remotion 打包有缓存；第一次会慢一些）。
  - 一键命令的核对一步用 ffprobe `-count_packets`（不解码，长视频也快；H.264 一帧一个包），冒烟测试独立用 `-count_frames`（解码）再核一次，不依赖一键命令自己的核对。
  - 07 留言里没验证的一点现在验证了：假 TTS 的 wav 末尾带自定义 RIFF 块，Remotion 渲染时正常读取，不报错。
  - 修了 12 的一个缺口：`npm run timeline` 只校验分镜格式和停顿，没有排组件触发帧，所以"触发帧落在画面之外"要到 `remotion render` 才报错（写冒烟样例时撞到）。现在 `exportTimeline` 也调用 `scheduleCues`，在时间轴一步就报错，和 12 留言说的"和 Remotion 用同一个分镜校验"一致了。加了一条 Vitest。
  - 测试：`tests/test_render.py`（新术语、缺字、锁定不一致和 `--revoice`、分镜不合格各停在哪一步；帧数相差一帧通过、两帧失败）和 `tests/test_cli.py` 两条（配置错报成"配音"一步、`--revoice` 透传）。这些都在时间轴一步之前或当时停下，不进入渲染，所以放在 `make check` 里也只多约 1 秒。
  - 渲染时 Remotion 在 stderr 打印版本不一致警告：`zod` 装的是 4.6.7，Remotion 4.0.539 要求 4.5.4（`package.json` 写的是 `^4.6.7`）。目前不影响渲染（冒烟测试和样片都通过），一键命令成功时不显示，只有渲染失败时会出现在附带的输出里。要不要按提示把 zod 固定到 4.5.4 请用户决定。
  - 样片：`uv run pixelbook render ../books/sample/ch01/ep01/script.yaml`，默认音色 tianmei（`voice.yaml` 和 `books/sample/voice.lock` 一致，不需要 `--revoice`），7 句全部命中配音缓存（缓存目录前后都是 14 个文件），`voice.lock` 未改动。产出 `out/sample-ch01-ep01.mp4`：视频流 565 帧 = 时间轴 565 帧，18.83 秒（30fps，1920×1080），音频流 18.84 秒；总时长 0:18 太短（只报告）；复核未通过：无。抽帧看过：左上角「读一本8bit像素书」、字幕逐句切换、DRY 方块在 s01-l03 触发帧之后出现、「一次」方块在 s02-l03 出现、调色板和像素字体生效。没有逐句听音画是否对齐，所以"样片"这一项留给人工验收时一起勾。
