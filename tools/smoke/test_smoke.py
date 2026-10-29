"""冒烟测试：用固定小样例，经一键命令 `pixelbook render` 真实渲染一次 MP4（票 11）。

慢（要打包并渲染 Remotion），不在 `make check` 里；单独运行 `make smoke`。
旁白是静音，成片里的声音只有配乐和音效。配乐（#39）选的是 48 kHz 的曲子（旁白、音效是
别的采样率，顺带验证混音时的重采样）。检查办法是拿原曲首尾相接当参照逐帧比电平：
第一个音效之前和参照一样，每个音效在它的帧比配乐高出一截（#37 原来用 silencedetect，
有了配乐之后静音段没有了，改成这样，见 #39 的评论）；成片里没有参照之外的静音；
三个方块同时入场、各放一个音效时不削波。
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
from pixelbook.music_check import (
    duration_problems,
    frame_levels,
    silences,
    sound_problems,
    stream_seconds,
    unexplained_silences,
)
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
    # 音效（#37）：时间轴列出每个音效的帧，登记过的 7 个音效都用到了
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
    # 配乐（#39）：48 kHz 的 Starlight City，最后 60 帧淡出；音频流和视频流一样长
    music = timeline["music"]
    total = timeline["totalFrames"]
    assert music["track"] == "starlight-city"
    assert music["fadeFrom"] == total - 60
    seconds = stream_seconds(mp4)
    assert (
        duration_problems(video=seconds["video"], audio=seconds["audio"], fps=fps) == []
    )
    # 参照：原曲首尾相接到整期长度。音效准时响起，第一个之前只有配乐
    track = repo / "public" / music["file"]
    reference = frame_levels(track, fps, loop_frames=total)
    mix = frame_levels(mp4, fps)[:total]
    assert sound_problems(mix, reference, [s["frame"] for s in sounds]) == []
    # 淡出之前，成片里的静音都是曲子自己的停顿（配乐从头放到尾）
    loop_seconds = total / fps
    assert (
        unexplained_silences(
            silences(mp4),
            silences(track, loop_seconds=loop_seconds, gain_db=music["volumeDb"]),
            within=[(0, music["fadeFrom"] / fps)],
        )
        == []
    )
    # 三个不同的音效同时响起，叠加也不削波（留 1 dB 余量）
    assert peak_db(mp4) < -1
    # 锁定音色写在临时的书目录里
    assert (repo / "books" / "smoke" / "voice.lock").is_file()
