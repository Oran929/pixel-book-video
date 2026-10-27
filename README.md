# 像素风书籍讲解视频

把书的一章改编成约 5 分钟、像素风、配音与画面同步的讲解视频。术语见 `GLOSSARY.md`，决策见 `docs/adr/`。

## 仓库结构

```
pronunciation.yaml   读音表（全频道共用）
voice.yaml           项目默认音色配置（由 `pixelbook choose-voice` 写入）
voices/              音色试听方案 audition.yaml，以及选定的参考音频
books/<书>/          书配置、锁定音色、配音缓存；书 → 章 → 期
tools/               Python 工具（uv 管理）：旁白稿 → 配音 → 合成清单
video/               Remotion 项目（npm 管理）：合成清单 + 分镜 → MP4
```

## 安装

需要 [uv](https://docs.astral.sh/uv/)、Node.js 和 ffmpeg（`brew install uv node ffmpeg`）。

```sh
make install
```

## 配音模型

配音用本机的 Qwen3-TTS 1.7B bf16，通过 mlx-audio 运行（ADR-0002），需要 Apple Silicon。模型第一次使用时会自动从 Hugging Face 下载到 `~/.cache/huggingface/`；也可以先手动下载（每个约 4 GB）：

```sh
cd tools
uv run hf download mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16         # 正式配音：参考音频克隆
uv run hf download mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16  # 试听：预设音色
uv run hf download mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16  # 试听：设计音色
```

首次运行会多花几十秒加载模型，之后每句话只算生成时间。

### 选定默认音色

```sh
cd tools
uv run pixelbook audition             # 按 voices/audition.yaml 生成试听音频到 out/audition/
uv run pixelbook choose-voice <名字>  # 把选中的音色写进 voice.yaml
```

`audition` 会为每个候选音色生成 `<名字>-<句号>.wav`，并打印每句的生成耗时、音频时长、峰值内存，以及一期（约 100 句）的耗时估算，完整数据在 `out/audition/report.json`。设计音色另外生成一句 `<名字>-ref.wav`：如果选中的是设计音色，`choose-voice` 会把这一句复制到 `voices/<名字>.wav` 作为参考音频，`voice.yaml` 改用 Base 模型克隆它。所以选之前也要听一下这句参考句。选中预设音色时，`voice.yaml` 直接记录模型和音色名。`voice.yaml` 里的 `ref_audio` 是相对仓库根目录的路径；`voice.yaml` 和参考音频都要提交。

## 检查

先运行过 `make install`，再运行：

```sh
make check
```

依次运行 pytest、ruff（lint + 格式）、`tsc`、ESLint、Vitest，任何一项失败就以非零码退出。"做完了"的标准就是这条命令通过。

## 预览

```sh
cd video && npm run studio
```
