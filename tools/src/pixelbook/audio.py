"""音频文件的测量。时长一律从文件本身量出，不信任模型的输出。"""

import wave
from pathlib import Path


def wav_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as wav:
        return wav.getnframes() / wav.getframerate()


def pad_wav(src: Path, dst: Path, head_seconds: float, tail_seconds: float) -> None:
    """在 wav 前后补静音，格式不变。"""
    with wave.open(str(src), "rb") as wav:
        params = wav.getparams()
        frames = wav.readframes(params.nframes)
    frame_bytes = params.sampwidth * params.nchannels

    def silence(seconds: float) -> bytes:
        return b"\x00" * (round(seconds * params.framerate) * frame_bytes)

    with wave.open(str(dst), "wb") as out:
        out.setparams(params)
        out.writeframes(silence(head_seconds) + frames + silence(tail_seconds))
