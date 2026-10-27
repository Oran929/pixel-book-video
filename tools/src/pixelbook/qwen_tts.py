"""真实 TTS 引擎：在 mlx-audio 上运行 Qwen3-TTS（ADR-0002）。

只在真实运行时导入 mlx-audio，测试一律使用假引擎，不加载模型。
"""

import time
from pathlib import Path
from typing import Any

from pixelbook import REPO_ROOT
from pixelbook.tts import SynthesisStats
from pixelbook.voice import Voice


class QwenTtsEngine:
    WARM_UP_TEXT = "你好。"

    def __init__(self) -> None:
        self._models: dict[str, Any] = {}

    def _model(self, model_id: str, warm_up_kwargs: dict[str, Any]) -> Any:
        if model_id not in self._models:
            from mlx_audio.tts.utils import load_model

            # 一次只留一个模型在内存里，试听时依次切换 CustomVoice / VoiceDesign
            self._models.clear()
            model = load_model(model_id)
            # 第一次生成要编译计算图，先空跑一句，免得把它算进每句耗时
            list(model.generate(**{**warm_up_kwargs, "text": self.WARM_UP_TEXT}))
            self._models[model_id] = model
        return self._models[model_id]

    def synthesize(self, text: str, voice: Voice, out: Path) -> SynthesisStats:
        import mlx.core as mx
        import numpy as np
        from mlx_audio.audio_io import write

        params = dict(voice.params)
        kwargs: dict[str, Any] = {
            "text": text,
            "lang_code": params.pop("language", "auto"),
            **params,
        }
        if voice.speaker:
            kwargs["voice"] = voice.speaker
        if voice.instruct:
            kwargs["instruct"] = voice.instruct
        if voice.ref_audio:
            kwargs["ref_audio"] = str(REPO_ROOT / voice.ref_audio)
            kwargs["ref_text"] = voice.ref_text
        model = self._model(voice.model, kwargs)

        mx.reset_peak_memory()
        start = time.perf_counter()
        results = list(model.generate(**kwargs))
        audio = mx.concatenate([r.audio for r in results]).astype(mx.float32)
        mx.eval(audio)
        elapsed = time.perf_counter() - start

        write(out, np.array(audio), model.sample_rate)
        return SynthesisStats(
            elapsed_seconds=elapsed, peak_memory_bytes=mx.get_peak_memory()
        )
