# 05: 按句配音缓存

**What to build:** 每句配音按"朗读文本 + 规范化后的音色设置"的指纹（哈希值）缓存，放在这本书的目录下 `books/<书>/cache/tts/<指纹>.wav`（ADR-0005、ADR-0006）。第二次运行时，没改动的句子直接复用缓存；只改一句时，只重新生成这一句。缓存只是加速手段：删掉之后，流水线能完整重建全部配音。

**Blocked by:** 03

**Type:** AFK

**Status:** ready-for-agent

- [x] 指纹包含朗读文本（读音替换之后的）、模型标识、参考音频**文件内容**的指纹（`voice.yaml` 里的 `ref_audio` 是相对仓库根目录的路径）、生成参数
- [x] 指纹不包含随机种子、重试次数这类"每次生成都可能不同"的值（07 重试时要换种子，但通过的那一版仍然存在同一个指纹下）
- [x] 每个缓存的 wav 旁边有一个同名的 `<指纹>.json`，记录生成信息；07 会在里面写复核结果
- [x] 缓存命中时不调用 TTS 引擎
- [x] 写缓存时先写临时文件再改名，中途中断不会留下损坏的缓存文件
- [x] 合成清单里的音频位置仍按 03 的约定（以 `video/public/` 为起点、文件名带内容哈希）；流水线从缓存复制到 `video/public/episode/`
- [x] 合成清单记录生成时使用的音色指纹
- [x] Python 测试（假引擎会记录调用次数）：第二次运行调用 0 次；改一句调用 1 次；改音色设置后全部重新生成；换了参考音频的内容（路径不变）也全部重新生成；删掉缓存后能完整重建

## Comments

- 来自 03（2026-10-28）：03 把每句 wav 写到 `books/<书>/cache/tts/<旁白句ID>.wav`，书目录由旁白稿路径推出（`script_path.parents[2]`）；`voice_episode(script_path, engine, voice, public_dir)` 每次都调用引擎。复制到 `video/public/episode/` 的部分（清空、按内容哈希命名、复制合成清单）已经有测试，05 改缓存命名时不用动它。合成清单里还没有音色指纹字段，05 加上时，TS 一侧的 zod schema（`video/src/episode/manifest.ts`）也要加。
- 来自 03 人工验收（2026-10-28）：`QwenTtsEngine` 会在参考音频首尾补静音（`REF_PAD_SECONDS`），这会影响生成结果。指纹里的"生成参数"要把它算进去，否则以后改这个值，缓存不会失效。
- 来自 04（2026-10-28）：指纹里的朗读文本用 `pixelbook.pronunciation.spoken_text(line, table)` 的结果（`voice_episode` 已经这样传给引擎）。`voice_episode` 的签名多了最后一个参数 `pronunciation`（读音表）；新术语检查在配音之前，有新术语时什么都不写，缓存也不会被碰到。
- 来自 05 实现（2026-10-28）：自动验收项都已完成，`make check` 通过；没有跑真实 TTS。没有改 `Status:`。
  - **结构**：新模块 `pixelbook.tts_cache`（`TtsCache`、`voice_fingerprint(voice, engine)`），`voice_episode` 签名不变。句指纹 = sha256(朗读文本 + 音色指纹) 的前 16 位十六进制；音色指纹同样取 16 位，写进合成清单顶层的 `voice_fingerprint`。
  - **音色指纹包含什么**：`model`、`speaker`、`instruct`、参考音频**文件内容**的 sha256、`ref_text`、`params`（去掉 `seed`），以及引擎自身的设置。参考音频的**路径不算**：同样内容挪了位置不会重新生成。参数不做默认值补全：`language` 不写和写 `auto` 算两个指纹（宁可多生成，不误用）。mlx-audio 的版本不在指纹里，升级依赖不会让缓存失效，要重新生成就删缓存。
  - **`REF_PAD_SECONDS`**：TTS 引擎接口多了 `settings` 属性（引擎自身影响生成结果的设置）。`QwenTtsEngine.settings` 由 `REF_PAD_SECONDS` 现算，改它就换音色指纹、整期重新生成；有测试。
  - **不进指纹的值**：`seed`（`tts_cache.UNFINGERPRINTED_PARAMS`）；重试次数本来就不在音色设置里。注意 `seed` 还不在 `voice.PARAM_KEYS` 里，`voice.yaml` 现在写不了种子（见 07 的 Comments）。
  - **命中条件**：`<指纹>.wav` 和 `<指纹>.json` 都在。两者都先写到同目录的 `.<指纹>-*.wav/.json` 临时文件再改名，json 最后写，所以它就是"这条缓存完整了"的标记。普通异常和 Ctrl-C 会删掉临时文件；`kill -9` 这类强杀可能留下以 `.` 开头的临时文件，它们不会被当成缓存，可以随手删。
  - **`<指纹>.json` 的字段**：`text`（朗读文本）、`voice_fingerprint`、`voice`（规范化后的音色设置，含 `ref_audio_sha256`）、`engine`（引擎设置）、`elapsed_seconds`、`peak_memory_bytes`、`generated_at`。
  - **参考音频不存在**时，在生成任何配音之前抛 `PipelineError`（以前要到真实引擎里才报错）。测试里的音色因此改用仓库里真实存在的 `voices/tianmei.wav`。
  - 同一期里朗读文本相同的两句共用一条缓存，只生成一次。
  - 缓存不会自动清理：不再用到的旧条目会一直留着；03 留下的按旁白句 ID 命名的旧文件（如 `books/sample/cache/tts/s01-l01.wav`）也不会被用到，可以删掉整个 `books/sample/cache/`。
  - `FakeTtsEngine` 现在记录每次的朗读文本（`texts`），测试用它数调用次数；`test_pronunciation.py` 里自己写的 `RecordingEngine` 去掉了。
