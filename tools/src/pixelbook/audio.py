"""音频文件的测量。时长一律从文件本身量出，不信任模型的输出。"""

import wave
from pathlib import Path


def wav_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as wav:
        return wav.getnframes() / wav.getframerate()
