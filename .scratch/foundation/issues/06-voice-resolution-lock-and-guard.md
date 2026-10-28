# 06: 音色解析、锁定与守卫

**What to build:** 书的音色 = 项目默认音色，除非书的配置里有覆盖。一本书第一次正式配音时，流水线把解析出的实际音色设置（不是"跟随默认"这个引用）写入锁定音色文件 `books/<书>/voice.lock`（提交到 git）。之后每次配音前，守卫比较"当前解析出的音色"和锁定音色；两者不一致时拒绝运行，并说明不一致的地方和两个选项（改回原来的音色，或者整本书重新配音）。使用显式的 `--revoice` 参数时，更新锁定，整本书用新音色重新生成（ADR-0005）。

**Blocked by:** 02、05

**Type:** AFK

**Status:** ready-for-agent

- [ ] 书配置 `books/<书>/book.yaml` 里可以覆盖音色，写法是引用一份音色配置文件：`voice: voices/yujie.yaml`（相对仓库根目录，格式与 `voice.yaml` 相同）。不覆盖时使用项目默认音色 `voice.yaml`
- [ ] 首次正式配音时写入锁定音色，内容是完整的音色设置和参考音频内容的指纹
- [ ] 项目默认音色改了、书的覆盖设置改了、或者参考音频文件的内容变了之后，守卫拒绝运行，提示信息列出锁定值和当前值
- [ ] 加上 `--revoice` 后可以通过：锁定被更新，所有句子按新音色重新生成
- [ ] 新术语试听、音色试听这类试听命令不受守卫限制，也不写入锁定；新术语试听改用书解析出的音色（04 里暂时用的是项目默认音色）
- [ ] Python 测试覆盖以上各种情况；测试在临时目录里进行，不写入真实的 `books/sample/voice.lock`

## Comments

- 来自 03（2026-10-28）：`pixelbook voice` 目前直接用 `load_voice_config(REPO_ROOT / "voice.yaml")` 作为音色传给 `voice_episode`（`tools/src/pixelbook/cli.py`），06 要把它换成书解析出的音色，并在流水线里加守卫。
- 来自 04（2026-10-28）：新术语试听是 `pixelbook terms`（`cli.py` 里的 `terms` 分支），音色作为参数传给 `pixelbook.term_audition.audition_terms`，目前传的是 `load_voice_config(REPO_ROOT / "voice.yaml")`；06 改成书解析出的音色时只改 CLI 这一处，`audition_terms` 不需要动，也不要经过守卫。书目录可以从旁白稿路径推出（`script_path.parents[2]`）。
- 来自 05（2026-10-28）：`pixelbook.tts_cache.voice_fingerprint(voice, engine)` 给出音色指纹（合成清单里的 `voice_fingerprint` 就是它），参考音频按文件内容算 sha256；锁定文件要的"参考音频内容的指纹"可以复用这里的规范化（`<指纹>.json` 的 `voice` 字段就是规范化后的样子，含 `ref_audio_sha256`）。注意音色指纹**也包括引擎自身的设置**（如 `QwenTtsEngine.REF_PAD_SECONDS`）：守卫如果直接比音色指纹，改了补静音也会被拦下要求 `--revoice`；如果只比音色设置，改补静音时这本书已配过的其他期会保留旧声音。两种都说得通，06 实现时选一种并写明。另外，音色变了缓存键自然就变，`--revoice` 不需要额外清缓存。参考音频不存在时 `voice_episode` 已经会抛 `PipelineError`。

