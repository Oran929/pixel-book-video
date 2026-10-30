"""片头片尾的音轨（#50、#51）：提交的 wav 就是各自的 `make_audio.py` 按 `timing.json` 合成出来的。

改了片头片尾的时间点、配音或音轨脚本却忘了重新生成，这里会失败。重新生成的命令见 docs/reference/video.md
「片头和片尾」；每个登记的片头片尾在下面的 `BOOKENDS` 里有一行（脚本的参数各不相同）。
"""

import json
import subprocess
import sys
import wave

import numpy as np
import pytest

from pixelbook import REPO_ROOT

SRC = REPO_ROOT / "video" / "src"
PUBLIC = REPO_ROOT / "video" / "public"
# 不同系统的数学库在最后一位上可能有出入：允许每个采样差 1（16 位整数）
TOLERANCE = 1
# 片尾的三句配音是用户录好的（24 kHz 单声道），脚本用 ffmpeg 重采样到 44.1 kHz 读进来；
# 不同版本的 ffmpeg 重采样结果在最后几位上不同（#51：本机 ffmpeg 9.0 生成的文件，
# CI 的 Ubuntu 24.04 上 ffmpeg 6.1 重新生成，最多差 2），所以片尾放宽到 4（约 -78 dBFS）
FFMPEG_TOLERANCE = 4

# (目录, 提交的音轨, 音轨脚本 timing.json 之后、输出文件之前的参数, 每个采样允许的差)
BOOKENDS = [
    (
        SRC / "intro" / "load-pixel-book",
        PUBLIC / "intro" / "load-pixel-book.wav",
        [],
        TOLERANCE,
    ),
    (
        SRC / "outro" / "bye-bye",
        PUBLIC / "outro" / "bye-bye.wav",
        [SRC / "outro" / "bye-bye" / "voice"],
        FFMPEG_TOLERANCE,
    ),
]


def _samples(path):
    with wave.open(str(path)) as w:
        params = (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes())
        return params, np.frombuffer(w.readframes(w.getnframes()), "<i2")


@pytest.mark.parametrize(
    ("folder", "committed", "args", "tolerance"),
    BOOKENDS,
    ids=[folder.name for folder, *_ in BOOKENDS],
)
def test_committed_audio_matches_a_fresh_render(
    tmp_path, folder, committed, args, tolerance
):
    timing = folder / "timing.json"
    out = tmp_path / committed.name
    subprocess.run(
        [sys.executable, "-I", folder / "make_audio.py", timing, *args, out],
        check=True,
        capture_output=True,
    )

    fresh_params, fresh = _samples(out)
    committed_params, committed_samples = _samples(committed)
    # 双声道、16 位、44.1 kHz，长度正好是 timing.json 的 total 帧（30fps）
    frames = json.loads(timing.read_text())["total"]
    assert fresh_params == committed_params == (2, 2, 44100, frames * 44100 // 30)
    diff = np.abs(fresh.astype(np.int32) - committed_samples.astype(np.int32))
    assert diff.max() <= tolerance
