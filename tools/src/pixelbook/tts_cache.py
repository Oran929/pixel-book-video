"""按句配音缓存（ADR-0005、ADR-0006）。

每句配音存成 `<缓存目录>/<指纹>.wav`，旁边的 `<指纹>.json` 记录生成信息。
指纹 = 朗读文本 + 音色指纹；音色指纹 = 规范化后的音色设置 + 引擎自身的设置。
缓存只是加速手段：删掉之后，流水线能完整重建。
"""

import hashlib
import json
from pathlib import Path
from typing import Any

from pixelbook import REPO_ROOT
from pixelbook.tts import TtsEngine
from pixelbook.voice import Voice

# 每次生成都可能不同、但不改变"这是哪一句、用什么音色"的参数，不进指纹。
# 07 重试时换种子，通过的那一版仍然存在同一个指纹下。
UNFINGERPRINTED_PARAMS = {"seed"}


def _digest(data: Any) -> str:
    canonical = json.dumps(data, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def voice_fingerprint(voice: Voice, engine: TtsEngine) -> str:
    """音色指纹：模型、音色来源、生成参数，加上引擎自身的设置。

    参考音频按文件内容算指纹（路径不算），所以同一路径换了内容也会换指纹。
    参考音频不存在时抛 `FileNotFoundError`。
    """
    return _digest({"voice": _normalized(voice), "engine": engine.settings})


def _normalized(voice: Voice) -> dict[str, Any]:
    ref_audio = None
    if voice.ref_audio:
        # `ref_audio` 相对仓库根目录；绝对路径接在后面仍是它自己
        content = (REPO_ROOT / voice.ref_audio).read_bytes()
        ref_audio = hashlib.sha256(content).hexdigest()
    return {
        "model": voice.model,
        "speaker": voice.speaker,
        "instruct": voice.instruct,
        "ref_audio_sha256": ref_audio,
        "ref_text": voice.ref_text,
        "params": {
            k: v for k, v in voice.params.items() if k not in UNFINGERPRINTED_PARAMS
        },
    }


class TtsCache:
    def __init__(self, directory: Path, engine: TtsEngine, voice: Voice) -> None:
        self.directory = directory
        self.engine = engine
        self.voice = voice
        self.voice_fingerprint = voice_fingerprint(voice, engine)

    def wav(self, text: str) -> Path:
        """返回朗读 `text` 的 wav；缓存里没有时才调用 TTS 引擎生成。"""
        key = _digest({"text": text, "voice": self.voice_fingerprint})
        wav = self.directory / f"{key}.wav"
        if not wav.is_file():
            self.directory.mkdir(parents=True, exist_ok=True)
            self.engine.synthesize(text, self.voice, wav)
        return wav
