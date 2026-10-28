"""语音识别引擎接口：输入一个 wav，输出识别出的文字（票 07）。"""

from pathlib import Path
from typing import Any, Protocol

from pixelbook.tts import FakeTtsEngine


class AsrEngine(Protocol):
    # 识别引擎的设置（引擎、模型），记进复核结果，方便事后知道是谁听的
    settings: dict[str, Any]

    def transcribe(self, wav: Path) -> str: ...


class FakeAsrEngine:
    """测试用：听见假 TTS 引擎说的文字，原样返回。

    `mishear` 设定某句（按朗读文本）前几次听成别的文字：
    `{"今天读书": ["今天", "今天读"]}` 表示前两次分别听成"今天""今天读"，之后听对。
    """

    def __init__(self, mishear: dict[str, list[str]] | None = None) -> None:
        self.settings: dict[str, Any] = {"engine": "fake"}
        self._mishear = {k: list(v) for k, v in (mishear or {}).items()}
        # 每次识别的结果，测试用它数调用次数
        self.heard: list[str] = []

    def transcribe(self, wav: Path) -> str:
        spoken = FakeTtsEngine.spoken_in(wav)
        queue = self._mishear.get(spoken)
        heard = queue.pop(0) if queue else spoken
        self.heard.append(heard)
        return heard
