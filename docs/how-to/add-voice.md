# 加新音色

音色配置的格式、锁定和缓存见 `docs/reference/voice.md`「配音模型」「书的音色与锁定」。

1. 在 `voices/audition.yaml` 的 `candidates` 里加一个候选：预设音色写 `model`（CustomVoice）和 `speaker`，设计音色写 `model`（VoiceDesign）和 `instruct`。测试旁白和参考句不要改，方便和现有音色对比。
2. 试听、选定：

```sh
cd tools
uv run pixelbook audition             # 按 voices/audition.yaml 生成试听音频到 voices/audition/
uv run pixelbook choose-voice <名字>  # 把选中的音色写进 voice.yaml
```

`audition` 会为每个候选音色生成 `<名字>-<句号>.wav`，并打印每句的生成耗时、音频时长、峰值内存，以及一期（约 100 句）的耗时估算，完整数据在 `voices/audition/report.json`（不提交）。设计音色另外生成一句 `<名字>-ref.wav`：如果选中的是设计音色，`choose-voice` 会把这一句复制到 `voices/<名字>.wav` 作为参考音频，`voice.yaml` 改用 Base 模型克隆它。所以选之前也要听一下这句参考句。选中预设音色时，`voice.yaml` 直接记录模型和音色名。`voice.yaml` 里的 `ref_audio` 是相对仓库根目录的路径；`voice.yaml` 和参考音频都要提交。

3. `choose-voice` 总是写项目默认音色 `voice.yaml`。新音色只给某几本书用时，把写出的 `voice.yaml` 改名成 `voices/<名字>.yaml`，再 `git checkout voice.yaml` 恢复默认音色；书怎么用它见 `docs/how-to/book-uses-yujie.md`「某本书改用 yujie」（把 yujie 换成新名字）。
4. 改的是项目默认音色时，已经配过音的书会被锁定拦下：要么在它们的 `book.yaml` 里写 `voice:` 指回旧音色，要么确认整本书换音色、各期加 `--revoice` 重配（[ADR-0005](../adr/0005-voice-locked-per-book.md)）。
5. 提交音色配置和参考音频（`voices/<名字>.wav`），试听音频不提交。
