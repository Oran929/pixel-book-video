# 06: 音色解析、锁定与守卫

**What to build:** 书的音色 = 项目默认音色，除非书的配置里有覆盖。一本书第一次正式配音时，流水线把解析出的实际音色设置（不是"跟随默认"这个引用）写入锁定音色文件 `books/<书>/voice.lock`（提交到 git）。之后每次配音前，守卫比较"当前解析出的音色"和锁定音色；两者不一致时拒绝运行，并说明不一致的地方和两个选项（改回原来的音色，或者整本书重新配音）。使用显式的 `--revoice` 参数时，更新锁定，整本书用新音色重新生成（ADR-0005）。

**Blocked by:** 02、05

**Type:** AFK

**Status:** ready-for-agent

- [x] 书配置 `books/<书>/book.yaml` 里可以覆盖音色，写法是引用一份音色配置文件：`voice: voices/yujie.yaml`（相对仓库根目录，格式与 `voice.yaml` 相同）。不覆盖时使用项目默认音色 `voice.yaml`
- [x] 首次正式配音时写入锁定音色，内容是完整的音色设置和参考音频内容的指纹
- [x] 项目默认音色改了、书的覆盖设置改了、或者参考音频文件的内容变了之后，守卫拒绝运行，提示信息列出锁定值和当前值
- [x] 加上 `--revoice` 后可以通过：锁定被更新，所有句子按新音色重新生成
- [x] 新术语试听、音色试听这类试听命令不受守卫限制，也不写入锁定；新术语试听改用书解析出的音色（04 里暂时用的是项目默认音色）
- [x] Python 测试覆盖以上各种情况；测试在临时目录里进行，不写入真实的 `books/sample/voice.lock`

## Comments

- 来自 03（2026-10-28）：`pixelbook voice` 目前直接用 `load_voice_config(REPO_ROOT / "voice.yaml")` 作为音色传给 `voice_episode`（`tools/src/pixelbook/cli.py`），06 要把它换成书解析出的音色，并在流水线里加守卫。
- 来自 04（2026-10-28）：新术语试听是 `pixelbook terms`（`cli.py` 里的 `terms` 分支），音色作为参数传给 `pixelbook.term_audition.audition_terms`，目前传的是 `load_voice_config(REPO_ROOT / "voice.yaml")`；06 改成书解析出的音色时只改 CLI 这一处，`audition_terms` 不需要动，也不要经过守卫。书目录可以从旁白稿路径推出（`script_path.parents[2]`）。
- 来自 05（2026-10-28）：`pixelbook.tts_cache.voice_fingerprint(voice, engine)` 给出音色指纹（合成清单里的 `voice_fingerprint` 就是它），参考音频按文件内容算 sha256；锁定文件要的"参考音频内容的指纹"可以复用这里的规范化（`<指纹>.json` 的 `voice` 字段就是规范化后的样子，含 `ref_audio_sha256`）。注意音色指纹**也包括引擎自身的设置**（如 `QwenTtsEngine.REF_PAD_SECONDS`）：守卫如果直接比音色指纹，改了补静音也会被拦下要求 `--revoice`；如果只比音色设置，改补静音时这本书已配过的其他期会保留旧声音。两种都说得通，06 实现时选一种并写明。另外，音色变了缓存键自然就变，`--revoice` 不需要额外清缓存。参考音频不存在时 `voice_episode` 已经会抛 `PipelineError`。
- 实现记录（06，2026-10-28）：
  - **待用户确认：守卫比较什么。** 按验收项实现：`voice.lock` 记录完整的音色设置（`model`、`speaker`、`ref_audio` 路径、`ref_text`、`params`）和参考音频内容的 sha256，守卫逐项比较这些。引擎自身的设置（如 `QwenTtsEngine.REF_PAD_SECONDS`）不进锁定、不触发守卫，只影响 05 的缓存键；随机种子也不进锁定（07 重试会换种子）。理由：锁定要防的是"同一本书混入另一种声音"，即音色选择的变化；补静音这类引擎修正是全局的工程调整，改了会让配过的句子按缓存键重新生成，但不该要求用户确认"整本书换音色"。代价是：改了引擎设置后，这本书已配过、还没重新运行 `voice` 的期仍是旧的生成结果（声音相同、细节可能不同）。如果希望引擎设置变化也拦下，把 `voice_lock.lock_record` 换成比较 `tts_cache.voice_fingerprint` 即可。
  - `ref_audio` 路径也写进锁定并参与比较：同一内容挪到别的路径也会被拦下，此时 `--revoice` 几乎没有代价（缓存键只看内容，全部命中）。
  - 锁定文件是 YAML（带两行注释说明不要手改），在整期配音**成功之后**才写入：新术语、参考音频缺失、中途中断都不会留下锁定。`--revoice` 中途失败时锁定保持旧值，下次仍需加 `--revoice`。
  - 守卫在旁白稿校验和新术语检测之后、生成任何一句之前运行（spec 写的是守卫在读音替换之前；两者都不调用 TTS，先报新术语还是先报音色不一致，对结果没有影响）。
  - `--revoice` 只重新配音命令指定的这一期并更新锁定；同一本书的其他期在各自下次运行 `voice` 时重新生成（锁定已更新，守卫放行；音色变了缓存键自然变）。没有做"一条命令重配整本书"，因为 `voice` 每次会把这一期复制到 `video/public/episode/`，一次配多期需要另定哪一期上屏。**待用户确认**是否需要整本书一次重配的命令；需要的话可以放进 11 的一键命令里。
  - 书配置 `book.yaml` 不存在、为空或没有 `voice` 键时都用项目默认音色；其他键（书名、作者）现在不校验。`voice` 不是字符串或引用的文件不存在时报 `VoiceConfigError`，指出 `book.yaml`。
  - 样例书的 `books/sample/voice.lock` 已提交：用 `resolve_book_voice` + `lock_record` 由当前 `voice.yaml`（tianmei）算出，没有调用 TTS。样例书现有的 `episode.json` 是 05 之前生成的（没有 `voice_fingerprint`），无法逐字核对它当时用的音色；按 02/03 的记录，选定并用于人工验收的就是 `voice.yaml` 的 tianmei。如果不是，删掉这个文件，下次真实配音时会重新写入。
  - 测试接缝（未能事先和用户确认，按票面选的）：`voice_lock.resolve_book_voice(book_dir, repo_root)`、`pipeline.voice_episode(..., revoice=)`、`cli.main([...])`（把 `QwenTtsEngine` 换成记录音色的假引擎、仓库根目录换成临时目录，见 `tools/tests/test_cli.py`）。
  - 05 里"换音色后全部重新生成"的几个测试改成了加 `revoice=True`（同一本书里换音色现在必须确认）。
  - `pixelbook.tts_cache._normalized` 改名为公开的 `normalized_voice`，锁定内容复用它。
