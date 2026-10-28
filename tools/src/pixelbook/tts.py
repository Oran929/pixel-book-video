"""TTS 引擎接口：输入朗读文本和音色设置，输出一个 wav。"""

import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from pixelbook.voice import Voice


@dataclass(frozen=True)
class SynthesisStats:
    elapsed_seconds: float
    peak_memory_bytes: int


class TtsEngine(Protocol):
    # 引擎自身会影响生成结果的设置（不在音色设置里的那些），算进音色指纹
    settings: dict[str, Any]

    def synthesize(self, text: str, voice: Voice, out: Path) -> SynthesisStats: ...


class FakeTtsEngine:
    """测试用：按文字长度生成确定时长的静音 wav，耗时和内存也是确定值。"""

    SAMPLE_RATE = 24_000
    SECONDS_PER_CHAR = 0.2
    ELAPSED_PER_CHAR = 0.1
    PEAK_MEMORY_BYTES = 6 * 1024**3

    def __init__(self, settings: dict[str, Any] | None = None) -> None:
        self.settings = settings or {"engine": "fake"}
        # 每次调用时的朗读文本，测试用它数调用次数
        self.texts: list[str] = []

    def synthesize(self, text: str, voice: Voice, out: Path) -> SynthesisStats:
        self.texts.append(text)
        frames = round(len(text) * self.SECONDS_PER_CHAR * self.SAMPLE_RATE)
        with wave.open(str(out), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(self.SAMPLE_RATE)
            wav.writeframes(b"\x00\x00" * frames)
        return SynthesisStats(
            elapsed_seconds=len(text) * self.ELAPSED_PER_CHAR,
            peak_memory_bytes=self.PEAK_MEMORY_BYTES,
        )
