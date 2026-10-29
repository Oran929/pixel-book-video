# 推迟的结构性改动（foundation 代码审查，2026-10-28）

用户决定：这些改动不影响功能，先不做；到阶段 3 写新代码、改到相关模块时一起做。来源是 foundation 分支代码审查的 Standards 轴。

- **期目录布局没有类型**：`books/<书>/<章>/<期>/` 现在靠 `parents[2]`（`pipeline.py`、`cli.py`）和 `"-".join(parts[-3:])`（`cli.py`）分散表达。建议引入 `EpisodePath` 之类的类型。
  - **已完成（阶段 3 第一期，PR #14，提交 b32760d）**：`tools/src/pixelbook/episode_path.py` 的 `EpisodePath`（`from_script`、`book_dir`、`id`），`pipeline.py`、`cli.py` 里已经没有 `parents[2]` 和 `"-".join(parts[-3:])`。#31 核对时补记。
- **复核结果和报告条目是裸 dict**：例如 `verification["attempts"][verification["chosen"]]`、字符串 `passed_by: "chars"/"pinyin"`，兼容旧缓存的分支散在 `pipeline` 里。建议改成 dataclass，`passed_by` 改成 enum。
  - **已完成（#30）**：`verification.py` 新增 `PassedBy`（enum）、`Attempt`、`Verification`，报告条目是 `pipeline.AsrReportEntry`。兼容旧缓存的分支集中在 `Verification.from_record`。缓存和 `report.json` 的格式不变（真实缓存 98 条逐条核对过分类一致）。`render`/`cli` 仍从 `report.json` 读回 dict，留给 #31 返回报告对象时一起改。（**已失效**：#31 起 `voice_episode` 返回报告对象，`render`/`cli` 改用 `AsrReportEntry` 的属性，不再读回 `report.json`。）
- **`voice_episode` 太长**：约 130 行，做了守卫、配音、复核分类、写清单、缺字检查、写报告、清理静态目录这些事。报告只写文件不返回，`render.py` 再从 `report.json` 读回来。建议拆分，并返回报告对象。
  - **已完成（#31）**：拆成 `_guarded_script`（草稿、片尾、新术语）、锁定音色守卫、`_check_glyphs`（缺字检查）、`_voice_lines`（配音和复核分类）、写合成清单、`_write_report`、`_stage_audio`（清理并填充静态目录）。`voice_episode` 返回 `VoicedEpisode`（合成清单 + `VoicingReport`），`render` 和 `cli` 直接用报告对象（属性访问），不再从 `report.json` 读回。`report.json` 的格式不变（`VoicingReport.to_json`）。
- **参数一起传**：`engine, voice, verifier, pronunciation, public_dir, font, revoice` 在 `voice_episode`、`render_episode`、`cli` 之间一起传，顺序也不一致。建议打包成一个配置对象。
  - **已完成（#31）**：`pipeline.VoicingSettings`（引擎、音色、复核器、读音表、静态目录、字体、是否重新配音）。签名是 `voice_episode(script_path, settings, draft=False)`、`render_episode(script_path, settings, out, draft=False, log=...)`；CLI 的 `voice`、`render` 共用 `_voicing_settings`。`draft` 是旁白稿的属性，不放进配置对象。
- **依赖方向**：`verification.py` 为了校验配置，从适配器 `mlx_asr` 导入 `ASR_MODELS`，核心模块因此依赖了具体引擎。
  - **已完成（#30）**：`ASR_MODELS` 挪到 `verification.py`（和 `VerificationConfig` 放在一起），`mlx_asr` 反过来从那里取。`test_verification` 在干净的解释器里导入 `pixelbook.verification`，断言 `pixelbook.mlx_asr` 没被加载（间接导入也算）。
- **测试夹具重复**：`test_pipeline`、`test_render`、`test_cli` 各自定义了 `VOICE`、`SCRIPT`，可以合并到 `conftest.py`。
  - **已完成（#30），现状**：`VOICE`、`SCRIPT` 早已在 `conftest.py`，`test_pipeline`、`test_render` 都从那里导入；`test_cli` 的 `DEFAULT`、`YUJIE` 是两种不同的音色，不算重复。其他文件里同名的 `VOICE`、`SCRIPT`（`test_pronunciation`、`test_voice_lock`、`test_term_audition`、`test_mix`）内容各不相同，是各自测试需要的输入，不合并。真正重复的是逐字相同的 `fake_asr_verifier`（`test_pipeline`、`test_pronunciation`、`test_voice_lock` 各一份），已合并到 `conftest.py`。
