"""冒烟测试：用固定小样例，经一键命令 `pixelbook render` 真实渲染一次 MP4（票 11）。

慢（要打包并渲染 Remotion），不在 `make check` 里；单独运行 `make smoke`。
旁白是静音，成片里的声音只有片头片尾的音轨、配乐和音效。配乐（#39）选的是 48 kHz 的曲子（旁白、音效是
别的采样率，顺带验证混音时的重采样）。检查办法是照排期把原曲放成参照（#52 起按交叉淡化循环、
淡出，`music_reference`），和成片逐帧比电平：
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
    music_reference,
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


def bookend_problems(mix: list[float], track: list[float]) -> list[str]:
    """片头或片尾期间成片和它的音轨逐帧比：响的帧（-40 dBFS 以上）相差不超过 1 dB。"""
    return [
        f"第 {f} 帧：成片 {m:.1f} dBFS，音轨 {i:.1f} dBFS"
        for f, (m, i) in enumerate(zip(mix, track, strict=True))
        if i > -40 and abs(m - i) > 1
    ]


def peak_db(mp4: Path, start: float, end: float) -> float:
    """ffmpeg volumedetect 量出的音轨第 `start`–`end` 秒的峰值（dBFS）。"""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-ss", f"{start}", "-to", f"{end}"]
        + ["-i", str(mp4), "-vn"]
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
    # 最前面是项目配置选的片头（#50，422 帧），最后是片尾（#51，324 帧）。
    # 假 TTS 每字 0.2 秒：正文 4 句共 30 字 = 6 秒；停顿 0.5（分镜覆盖）+ 0.3（同画面）
    # + 0.8（换画面）= 1.6 秒；正文 7.6 秒，30fps 约 228 帧（逐句取整到整帧）。
    # 配音不再追加 TTS 片尾（#51），最后一句是旁白稿的最后一句
    intro, outro = timeline["introFrames"], timeline["outroFrames"]
    total = timeline["totalFrames"]
    body_end = total - outro
    assert (intro, outro) == (422, 324)
    assert 226 <= body_end - intro <= 232
    assert timeline["lines"][0]["startFrame"] == intro
    assert timeline["lines"][-1]["id"] == "s02-l01"
    assert timeline["lines"][-1]["endFrame"] == body_end
    assert abs(video_frames(mp4) - total) <= 1
    # 约 32 秒的样例必然"太短"：只报告，不让命令失败
    assert timeline["duration"]["verdict"] == "too-short"
    # 判断的说明文字由时间轴导出命令写进 timeline.json，汇总原样打印
    # 片头 14.07 秒，正文 7.6 秒，片尾 10.8 秒，分开写
    assert (
        "总时长 0:32：太短（目标 4:00–6:00，只报告）（片头 0:14，正文 0:07，片尾 0:10）"
        in out
    )
    # 打点时间表从 00:00 的片头开始，不列片尾（每期都一样）
    assert (episode / "segments.txt").read_text().splitlines() == [
        "00:00 片头",
        "00:14 开场",
        "00:19 结尾",
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
    # 配乐（#39，#52 换库）：48 kHz 的 Kalypo，片头结束后才开始（#50），正文最后 60 帧淡出，
    # 片尾开始时放完（#51）；正文比曲子短，只放一次；音频流和视频流一样长
    music = timeline["music"]
    assert music["track"] == "kalypo"
    assert len(music["plays"]) == 1
    assert music["startFrame"] == intro
    assert music["endFrame"] == body_end
    assert music["fadeFrom"] == body_end - 60
    seconds = stream_seconds(mp4)
    assert (
        duration_problems(video=seconds["video"], audio=seconds["audio"], fps=fps) == []
    )
    # 片头、片尾期间成片里只有它们自带的音轨：逐帧电平和它一样（没有配乐叠上去）
    mix = frame_levels(mp4, fps)[:total]
    public = repo / "public"
    intro_track = frame_levels(public / "intro" / "load-pixel-book.wav", fps)
    assert bookend_problems(mix[:intro], intro_track[:intro]) == []
    outro_track = frame_levels(public / "outro" / "bye-bye.wav", fps)
    assert bookend_problems(mix[body_end:], outro_track[: total - body_end]) == []
    # 参照：照排期把原曲从片头结束放到正文结束。音效准时响起，第一个之前只有配乐
    reference_wav = music_reference(
        music, total, fps, public, repo / "out" / "smoke-music-reference.wav"
    )
    reference = frame_levels(reference_wav, fps)[:body_end]
    assert sound_problems(mix[:body_end], reference, [s["frame"] for s in sounds]) == []
    # 片头之后、淡出之前，成片里的静音都是曲子自己的停顿
    start = intro / fps
    assert (
        unexplained_silences(
            silences(mp4),
            silences(reference_wav),
            within=[(start, music["fadeFrom"] / fps)],
        )
        == []
    )
    # 三个不同的音效同时响起，叠加也不削波（留 1 dB 余量）。只量正文：片头片尾的
    # 音轨本身压到约 -1 dBFS，AAC 编码后约 -0.7 dBFS，不归这条管
    assert peak_db(mp4, start, body_end / fps) < -1
    # 锁定音色写在临时的书目录里
    assert (repo / "books" / "smoke" / "voice.lock").is_file()
