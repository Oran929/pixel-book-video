"""按句配音缓存（ADR-0005、ADR-0006）。

每句配音存成 `<缓存目录>/<指纹>.wav`，旁边的 `<指纹>.json` 记录生成信息。
指纹 = 朗读文本 + 音色指纹；音色指纹 = 规范化后的音色设置 + 引擎自身的设置。
缓存只是加速手段：删掉之后，流水线能完整重建。
"""

import hashlib
import json
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
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
    return _digest(_settings(voice, engine))


def _settings(voice: Voice, engine: TtsEngine) -> dict[str, Any]:
    return {"voice": normalized_voice(voice), "engine": engine.settings}


def normalized_voice(voice: Voice) -> dict[str, Any]:
    """音色设置的规范化形式：参考音频换成内容的 sha256，去掉不进指纹的参数。"""
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
        self._settings = _settings(voice, engine)
        self.voice_fingerprint = _digest(self._settings)

    def wav(self, text: str) -> Path:
        """返回朗读 `text` 的 wav；缓存里没有时才调用 TTS 引擎生成。

        `<指纹>.json` 最后写出，有它才算缓存命中。
        """
        key = _digest({"text": text, "voice": self.voice_fingerprint})
        wav = self.directory / f"{key}.wav"
        info = self.directory / f"{key}.json"
        if wav.is_file() and info.is_file():
            return wav
        self.directory.mkdir(parents=True, exist_ok=True)
        with _staged(wav) as tmp:
            stats = self.engine.synthesize(text, self.voice, tmp)
        record = {
            "text": text,
            "voice_fingerprint": self.voice_fingerprint,
            **self._settings,
            "elapsed_seconds": stats.elapsed_seconds,
            "peak_memory_bytes": stats.peak_memory_bytes,
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        }
        with _staged(info) as tmp:
            tmp.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
        return wav


@contextmanager
def _staged(target: Path) -> Iterator[Path]:
    """先写同目录下的临时文件，写完再改名成 `target`；中途出错就删掉临时文件。

    临时文件保留原扩展名（音频库按扩展名决定格式），以 `.` 开头。
    """
    fd, name = tempfile.mkstemp(
        dir=target.parent, prefix=f".{target.stem}-", suffix=target.suffix
    )
    os.close(fd)
    tmp = Path(name)
    try:
        yield tmp
        tmp.replace(target)
    finally:
        tmp.unlink(missing_ok=True)
