# 换语音识别模型

语音识别复核的规则见 `docs/reference/voice.md`「语音识别复核」。

1. 改仓库根目录 `verification.yaml` 的 `asr`：`qwen3-asr`（`Qwen/Qwen3-ASR-1.7B`，约 4 GB）或 `whisper`（`mlx-community/whisper-large-v3-turbo-asr-fp16`，约 1.6 GB）。第一次使用时自动下载，也可以先手动下载：

   ```sh
   cd tools
   uv run hf download Qwen/Qwen3-ASR-1.7B
   uv run hf download mlx-community/whisper-large-v3-turbo-asr-fp16
   ```

2. 换模型不影响声音，不会被音色锁定拦下，也不会让已缓存的句子重新复核。想让某一期按新模型重新复核，删掉 `books/<书>/cache/tts/` 里这些句子的缓存（`<指纹>.wav` 和 `<指纹>.json`）再配音，这些句子会重新生成。
3. 要用这两个以外的模型：在 `tools/src/pixelbook/verification.py` 的 `ASR_MODELS` 里加一项（名字 → 模型、传给识别引擎的语言），测试先行，再 `make check`。模型要是 mlx-audio 能载入的识别模型。
