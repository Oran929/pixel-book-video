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
    """测试用：按文字长度生成确定时长的静音 wav，耗时和内存也是确定值。

    wav 末尾附带一个自定义块，记下"说了什么"，假语音识别引擎靠它"听"
    （`spoken_in`）。音频读取工具会跳过不认识的块，不影响时长和播放。
    """

    SAMPLE_RATE = 24_000
    SECONDS_PER_CHAR = 0.2
    ELAPSED_PER_CHAR = 0.1
    PEAK_MEMORY_BYTES = 6 * 1024**3
    SPOKEN_CHUNK = b"pbsp"

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
        _append_chunk(out, self.SPOKEN_CHUNK, text.encode())
        return SynthesisStats(
            elapsed_seconds=len(text) * self.ELAPSED_PER_CHAR,
            peak_memory_bytes=self.PEAK_MEMORY_BYTES,
        )

    @classmethod
    def spoken_in(cls, wav: Path) -> str:
        """读出假引擎生成这个 wav 时说的文字。"""
        data = wav.read_bytes()
        pos = 12  # 跳过 RIFF 头
        while pos + 8 <= len(data):
            name, size = (
                data[pos : pos + 4],
                int.from_bytes(data[pos + 4 : pos + 8], "little"),
            )
            if name == cls.SPOKEN_CHUNK:
                return data[pos + 8 : pos + 8 + size].decode()
            pos += 8 + size + size % 2
        raise ValueError(f"{wav} 不是假 TTS 引擎生成的")


def _append_chunk(wav: Path, name: bytes, payload: bytes) -> None:
    """在 wav 末尾追加一个 RIFF 块，并更新文件头里的总长度。"""
    with wav.open("r+b") as f:
        f.seek(0, 2)
        f.write(name + len(payload).to_bytes(4, "little") + payload)
        if len(payload) % 2:
            f.write(b"\x00")
        size = f.tell() - 8
        f.seek(4)
        f.write(size.to_bytes(4, "little"))
