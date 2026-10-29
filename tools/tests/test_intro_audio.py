"""片头音轨（#50）：提交的 wav 就是 `make_audio.py` 按 `timing.json` 合成出来的。

改了片头的时间点或音轨脚本却忘了重新生成，这里会失败。重新生成：

    tools/.venv/bin/python video/src/intro/make_audio.py \\
        video/src/intro/timing.json video/public/intro/intro-audio.wav
"""

import subprocess
import sys
import wave

import numpy as np

from pixelbook import REPO_ROOT

INTRO = REPO_ROOT / "video" / "src" / "intro"
COMMITTED = REPO_ROOT / "video" / "public" / "intro" / "intro-audio.wav"
# 不同系统的数学库在最后一位上可能有出入：允许每个采样差 1（16 位整数）
TOLERANCE = 1


def _samples(path):
    with wave.open(str(path)) as w:
        params = (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes())
        return params, np.frombuffer(w.readframes(w.getnframes()), "<i2")


def test_committed_intro_audio_matches_a_fresh_render(tmp_path):
    out = tmp_path / "intro-audio.wav"
    subprocess.run(
        [sys.executable, "-I", INTRO / "make_audio.py", INTRO / "timing.json", out],
        check=True,
        capture_output=True,
    )

    fresh_params, fresh = _samples(out)
    committed_params, committed = _samples(COMMITTED)
    # 双声道、16 位、44.1 kHz，长度正好是 422 帧（30fps）
    assert fresh_params == committed_params == (2, 2, 44100, 422 * 44100 // 30)
    diff = np.abs(fresh.astype(np.int32) - committed.astype(np.int32))
    assert diff.max() <= TOLERANCE
