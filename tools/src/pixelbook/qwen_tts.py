"""真实 TTS 引擎：在 mlx-audio 上运行 Qwen3-TTS（ADR-0002）。

只在真实运行时导入 mlx-audio，测试一律使用假引擎，不加载模型。
"""

import tempfile
import time
from pathlib import Path
from typing import Any

from pixelbook import REPO_ROOT
from pixelbook.audio import pad_wav
from pixelbook.tts import SynthesisStats
from pixelbook.voice import Voice


class QwenTtsEngine:
    WARM_UP_TEXT = "你好。"
    # Base 克隆把参考音频和生成的音频一起解码，再按比例切掉参考部分。参考音频
    # 首尾贴着说话声时，切点附近会留下参考音频结尾的字（听到一声"的"），生成
    # 的句子也会照着参考音频的样子戛然而止。首尾补上静音就没有这两个问题。
    REF_PAD_SECONDS = (0.2, 0.6)

    def __init__(self) -> None:
        self._models: dict[str, Any] = {}
        self._padded_refs: dict[Path, Path] = {}
        self._tmp = tempfile.TemporaryDirectory(prefix="pixelbook-ref-")

    @property
    def settings(self) -> dict[str, Any]:
        """引擎自身影响生成结果的设置，算进音色指纹（改了就重新配音）。"""
        return {
            "engine": "qwen3-tts-mlx",
            "ref_pad_seconds": list(self.REF_PAD_SECONDS),
        }

    def _padded_ref(self, ref_audio: Path) -> Path:
        if ref_audio not in self._padded_refs:
            padded = Path(self._tmp.name) / f"{len(self._padded_refs)}-{ref_audio.name}"
            pad_wav(ref_audio, padded, *self.REF_PAD_SECONDS)
            self._padded_refs[ref_audio] = padded
        return self._padded_refs[ref_audio]

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
            kwargs["ref_audio"] = str(self._padded_ref(REPO_ROOT / voice.ref_audio))
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
