# 推迟的结构性改动（foundation 代码审查，2026-10-28）

用户决定：这些改动不影响功能，先不做；到阶段 3 写新代码、改到相关模块时一起做。来源是 foundation 分支代码审查的 Standards 轴。

- **期目录布局没有类型**：`books/<书>/<章>/<期>/` 现在靠 `parents[2]`（`pipeline.py`、`cli.py`）和 `"-".join(parts[-3:])`（`cli.py`）分散表达。建议引入 `EpisodePath` 之类的类型。
- **复核结果和报告条目是裸 dict**：例如 `verification["attempts"][verification["chosen"]]`、字符串 `passed_by: "chars"/"pinyin"`，兼容旧缓存的分支散在 `pipeline` 里。建议改成 dataclass，`passed_by` 改成 enum。
- **`voice_episode` 太长**：约 130 行，做了守卫、配音、复核分类、写清单、缺字检查、写报告、清理静态目录这些事。报告只写文件不返回，`render.py` 再从 `report.json` 读回来。建议拆分，并返回报告对象。
- **参数一起传**：`engine, voice, verifier, pronunciation, public_dir, font, revoice` 在 `voice_episode`、`render_episode`、`cli` 之间一起传，顺序也不一致。建议打包成一个配置对象。
- **依赖方向**：`verification.py` 为了校验配置，从适配器 `mlx_asr` 导入 `ASR_MODELS`，核心模块因此依赖了具体引擎。
- **测试夹具重复**：`test_pipeline`、`test_render`、`test_cli` 各自定义了 `VOICE`、`SCRIPT`，可以合并到 `conftest.py`。
