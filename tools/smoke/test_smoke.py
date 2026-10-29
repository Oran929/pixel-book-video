"""冒烟测试：用固定小样例，经一键命令 `pixelbook render` 真实渲染一次 MP4（票 11）。

慢（要打包并渲染 Remotion），不在 `make check` 里；单独运行 `make smoke`。
旁白是静音，成片里的声音只有音效：顺带用 silencedetect 检查每个音效都在它的帧响起、
三个方块同时入场、各放一个音效时不削波（#37）。
真实 TTS 和语音识别换成假引擎（静音 wav），不加载任何模型；验证的是渲染管线和
时长，不是音质。仓库根目录、Remotion 静态目录都换成临时目录：旁白稿、配音缓存、
锁定音色和 MP4 都在里面，不碰 `books/`、`video/public/episode/` 和 `out/`。
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from pixelbook import REPO_ROOT, cli
from pixelbook.asr import FakeAsrEngine
from pixelbook.pipeline import STAGE_DIR
from pixelbook.tts import FakeTtsEngine
from pixelbook.voice import Voice, save_voice_config

FIXTURE = Path(__file__).parent / "episode"


@pytest.fixture
def repo(tmp_path, monkeypatch):
    monkeypatch.setattr("pixelbook.qwen_tts.QwenTtsEngine", FakeTtsEngine)
    monkeypatch.setattr("pixelbook.mlx_asr.MlxAsrEngine", lambda name: FakeAsrEngine())
    save_voice_config(
        Voice(model="fake-model", speaker="Vivian"), tmp_path / "voice.yaml"
    )
    (tmp_path / "pronunciation.yaml").write_text("{}\n")
    (tmp_path / "verification.yaml").write_text(
        "asr: whisper\nmax_diff_rate: 0\nmax_retries: 0\n"
    )
    # 临时的 Remotion 静态目录：字体和小人图照搬，本期文件由配音一步放进去
    public = tmp_path / "public"
    shutil.copytree(
        REPO_ROOT / "video" / "public", public, ignore=shutil.ignore_patterns(STAGE_DIR)
    )
    monkeypatch.setattr(cli, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(cli, "PRONUNCIATION", tmp_path / "pronunciation.yaml")
    monkeypatch.setattr(cli, "VERIFICATION", tmp_path / "verification.yaml")
    monkeypatch.setattr(cli, "VIDEO_PUBLIC", public)
    shutil.copytree(FIXTURE, tmp_path / "books" / "smoke" / "ch01" / "ep01")
    return tmp_path


def video_frames(mp4: Path) -> int:
    """ffprobe 解码数出视频流的帧数（不用容器里记的值）。"""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames"]
        + ["-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(mp4)],
        capture_output=True,
        text=True,
        check=True,
    )
    return int(result.stdout.strip())


# 静音判定：低于 -50 dBFS、持续 20 毫秒以上算静音。假 TTS 的旁白是静音，所以成片里的声音只有音效
SILENCE_DB = -50
SILENCE_SECONDS = 0.02


def silences(mp4: Path) -> list[tuple[float, float]]:
    """ffmpeg silencedetect 找出的静音区间（秒）；文件末尾的静音没有结束时间，算到无穷远。"""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(mp4), "-vn"]
        + ["-af", f"silencedetect=noise={SILENCE_DB}dB:d={SILENCE_SECONDS}"]
        + ["-f", "null", "-"],
        capture_output=True,
        text=True,
        check=True,
    )
    starts = [float(v) for v in re.findall(r"silence_start: (-?[\d.]+)", result.stderr)]
    ends = [float(v) for v in re.findall(r"silence_end: (-?[\d.]+)", result.stderr)]
    ends += [float("inf")] * (len(starts) - len(ends))
    return list(zip(starts, ends, strict=True))


def peak_db(mp4: Path) -> float:
    """ffmpeg volumedetect 量出的音轨峰值（dBFS）。"""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(mp4), "-vn"]
        + ["-af", "volumedetect", "-f", "null", "-"],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(re.search(r"max_volume: (-?[\d.]+) dB", result.stderr).group(1))


def test_fixed_sample_renders_with_the_computed_number_of_frames(repo, capsys):
    episode = repo / "books" / "smoke" / "ch01" / "ep01"

    assert cli.main(["render", str(episode / "script.yaml")]) == 0

    out = capsys.readouterr().out
    mp4 = repo / "out" / "smoke-ch01-ep01.mp4"
    assert f"成片 {mp4}" in out
    assert "复核未通过：无" in out
    timeline = json.loads((episode / "timeline.json").read_text())
    # 假 TTS 每字 0.2 秒：正文 4 句共 30 字 = 6 秒；停顿 0.5（分镜覆盖）+ 0.3（同画面）
    # + 0.8（换画面）= 1.6 秒；正文 7.6 秒。片尾（票 #15）前换画面停 0.8 秒，
    # 3 句共 33 字 = 6.6 秒，句间 2 × 0.3 秒；共 15.6 秒，30fps 约 468 帧（逐句取整到整帧）
    assert 465 <= timeline["totalFrames"] <= 472
    assert [line["id"] for line in timeline["lines"][-3:]] == [
        "outro-l01",
        "outro-l02",
        "outro-l03",
    ]
    assert abs(video_frames(mp4) - timeline["totalFrames"]) <= 1
    # 约 16 秒的样例必然"太短"：只报告，不让命令失败
    assert timeline["duration"]["verdict"] == "too-short"
    # 判断的说明文字由时间轴导出命令写进 timeline.json，汇总原样打印
    # 正文（含片尾前的停顿）8.4 秒，片尾 7.2 秒，分开写
    assert "总时长 0:15：太短（目标 4:00–6:00，只报告）（正文 0:08，片尾 0:07）" in out
    # 打点时间表不列片尾（每期都一样）
    assert (episode / "segments.txt").read_text().splitlines() == [
        "00:00 开场",
        "00:05 结尾",
    ]
    # 音效（#37）：时间轴列出每个音效的帧，登记过的 7 个音效都用到了。成片里每个音效帧之后
    # 半帧到一帧半之间都有声音（不落在任何静音区间里）；第一声之前是静音，并且在第一声的帧
    # 附近（±1 帧）结束，说明音效准时响起
    fps = timeline["fps"]
    sounds = timeline["sounds"]
    # 一个方块落下、高亮、改过、淡出；三个方块同时入场（各放一个不同的音效），
    # 其中一个改成崩溃声，另一个切换状态时不放音效
    assert [s["sound"] for s in sounds] == [
        "drop",
        "blip",
        "buzz",
        "leave",
        "drop",
        "pop",
        "ding",
        "crash",
    ]
    quiet = silences(mp4)
    for sound in sounds:
        t = sound["frame"] / fps
        heard = (t + 0.5 / fps, t + 1.5 / fps)
        assert not any(a <= heard[0] and heard[1] <= b for a, b in quiet), sound
    first = sounds[0]["frame"] / fps
    assert quiet[0][0] == pytest.approx(0, abs=0.01)
    assert quiet[0][1] == pytest.approx(first, abs=1 / fps)
    # 三个不同的音效同时响起，叠加也不削波（留 1 dB 余量）
    assert peak_db(mp4) < -1
    # 锁定音色写在临时的书目录里
    assert (repo / "books" / "smoke" / "voice.lock").is_file()
