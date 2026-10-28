"""真实语音识别引擎：mlx-audio 自带的 Whisper 和 Qwen3-ASR（票 07）。

只在第一次识别时加载模型：整期都命中缓存时不加载。测试一律使用假引擎。
"""

from pathlib import Path
from typing import Any

# 配置里的名字 → （模型，传给 `generate` 的语言）
# Whisper 要用带 HuggingFace processor（分词器）的 `-asr-fp16` 版本：
# mlx-community/whisper-large-v3-turbo 只有权重，mlx-audio 载入后识别会报
# "Processor not found"。
ASR_MODELS: dict[str, tuple[str, str]] = {
    "whisper": ("mlx-community/whisper-large-v3-turbo-asr-fp16", "zh"),
    "qwen3-asr": ("Qwen/Qwen3-ASR-1.7B", "Chinese"),
}


class MlxAsrEngine:
    def __init__(self, name: str) -> None:
        self.model_id, self.language = ASR_MODELS[name]
        self.settings: dict[str, Any] = {"engine": name, "model": self.model_id}
        self._model: Any = None

    def transcribe(self, wav: Path) -> str:
        if self._model is None:
            from mlx_audio.stt.utils import load_model

            self._model = load_model(self.model_id)
        return self._model.generate(str(wav), language=self.language).text.strip()
