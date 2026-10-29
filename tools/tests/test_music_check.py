"""配乐检查（#39）：成片的配乐和参照（原曲首尾相接、不淡出）逐帧比电平。"""

import subprocess

import pytest

from pixelbook.music_check import (
    check_music,
    duration_problems,
    frame_levels,
    music_problems,
    seam_windows,
    silences,
    sound_problems,
    stream_seconds,
    unexplained_silences,
)

# 参照：原曲的逐帧 RMS（dBFS），起伏像音乐
REFERENCE = [-30.0 - (f % 7) for f in range(200)]


def test_music_following_the_reference_at_a_constant_gain_passes():
    # 配乐音量 -20 dB，渲染出来整体比参照低 20 dB；最后 60 帧从 140 帧起淡出
    stem = [db - 20 for db in REFERENCE[:140]] + [
        db - 20 - (f + 1) * 0.5 for f, db in enumerate(REFERENCE[140:])
    ]

    assert music_problems(stem, REFERENCE, fade_from=140) == []


def steady(gain_db: float = -20, frames: int = 200) -> list[float]:
    """淡出之前一直比参照低 `gain_db`，最后 60 帧每帧再低 0.5 dB。"""
    fade_from = frames - 60
    return [
        db + gain_db - max(0, f - fade_from + 1) * 0.5
        for f, db in enumerate(REFERENCE[:frames])
    ]


def test_a_dropout_at_a_loop_seam_is_reported_with_its_frame():
    stem = steady()
    stem[100] -= 12  # 第 100 帧（接缝）掉下去 12 dB

    problems = music_problems(stem, REFERENCE, fade_from=140)

    assert len(problems) == 1
    assert "第 100 帧" in problems[0]


def test_a_fade_that_rises_again_is_reported():
    stem = steady()
    stem[170] += 3  # 淡出到一半又响了一下

    problems = music_problems(stem, REFERENCE, fade_from=140)

    assert problems == [
        "淡出没有单调下降：第 170 帧比上一帧高 2.5 dB（允许 0.3 dB 的测量误差）"
    ]


def test_a_fade_that_does_not_go_low_enough_is_reported():
    # 只降了 6 dB：音量从 0.1 降到 0 应当降得远多于 20 dB
    stem = [db - 20 - max(0, f - 139) * 0.1 for f, db in enumerate(REFERENCE)]

    problems = music_problems(stem, REFERENCE, fade_from=140)

    assert problems == ["淡出到最后只降了 6.0 dB，应当至少降 20 dB"]


def test_silences_near_a_seam_that_the_reference_also_has_are_part_of_the_music():
    # 曲子自己在 10.0–10.1 秒有个停顿；接缝在 34.3 秒，那里多出一段静音
    reference = [(10.0, 10.1), (40.0, 40.2)]
    found = [(10.0, 10.1), (34.28, 34.35), (40.01, 40.2)]

    within = seam_windows([10.05, 34.3, 40.1])
    assert unexplained_silences(found, reference, within=within) == [(34.28, 34.35)]


def test_silences_away_from_the_seams_are_not_counted():
    within = seam_windows([34.3])
    assert unexplained_silences([(20.0, 20.5)], [], within=within) == []


def test_each_sound_effect_stands_out_of_the_music_on_its_frame():
    # 混音比参照低 20 dB；第 50 帧的音效让那一帧和下一帧高出 8 dB
    mix = [db - 20 for db in REFERENCE]
    mix[50] += 8
    mix[51] += 4

    assert sound_problems(mix, REFERENCE, [50]) == []


def test_a_late_sound_effect_is_reported():
    mix = [db - 20 for db in REFERENCE]
    mix[52] += 8  # 排在第 50 帧，晚了两帧

    assert sound_problems(mix, REFERENCE, [50]) == [
        "第 50 帧的音效听不出来：比配乐只高 0.0 dB，至少要高 3 dB"
    ]


def test_sound_before_the_first_sound_effect_is_reported():
    mix = [db - 20 for db in REFERENCE]
    mix[48] += 8  # 早了两帧
    mix[50] += 8

    assert sound_problems(mix, REFERENCE, [50]) == [
        "第一个音效（第 50 帧）之前，第 48 帧就有别的声音（比配乐高 8.0 dB）"
    ]


def sine(path, seconds, gap=None):
    """0.5 振幅的 440 Hz 正弦波（RMS 约 -9 dBFS）；`gap` 是一段静音的（起, 止）秒。"""
    expr = "0.5*sin(2*PI*440*t)"
    if gap:
        expr = f"if(between(t,{gap[0]},{gap[1]}),0,{expr})"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi"]
        + ["-i", f"aevalsrc='{expr}':s=48000:d={seconds}", str(path)],
        check=True,
    )
    return path


def test_frame_levels_measures_each_frame_of_audio(tmp_path):
    levels = frame_levels(sine(tmp_path / "a.wav", 1), fps=30)

    assert len(levels) == 30
    assert all(abs(db - -9.03) < 0.1 for db in levels)


def test_frame_levels_can_loop_a_track_to_a_length(tmp_path):
    levels = frame_levels(sine(tmp_path / "a.wav", 0.5), fps=30, loop_frames=60)

    assert len(levels) == 60


def test_silences_finds_the_quiet_stretches(tmp_path):
    found = silences(sine(tmp_path / "a.wav", 1, gap=(0.4, 0.6)))

    assert len(found) == 1
    assert found[0] == pytest.approx((0.4, 0.6), abs=0.01)


def test_audio_as_long_as_the_video_within_a_frame_passes():
    # AAC 编码会在末尾多出十几毫秒
    assert duration_problems(video=266.3, audio=266.316, fps=30) == []


def test_audio_shorter_than_the_video_is_reported():
    assert duration_problems(video=266.3, audio=265.0, fps=30) == [
        "音频流 265.000 秒，视频流 266.300 秒，相差超过一帧"
    ]


def test_stream_seconds_reads_both_streams(tmp_path):
    mp4 = tmp_path / "a.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=black:s=64x64:r=30:d=1"]
        + ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "0.5"]
        + ["-c:v", "libx264", "-c:a", "aac", "-shortest", str(mp4)],
        check=True,
    )

    seconds = stream_seconds(mp4)

    assert seconds["video"] == pytest.approx(0.5, abs=0.04)
    assert seconds["audio"] == pytest.approx(0.5, abs=0.04)


def test_silences_can_turn_the_volume_down_first(tmp_path):
    # -9 dBFS 的正弦波调低 45 dB 就低于 -50 dBFS，整段都算静音
    found = silences(sine(tmp_path / "a.wav", 1), gain_db=-45)

    assert found == [(0, 1)]


# 全长试验的整套检查：用 ffmpeg 合成「曲子」、配乐声轨和成片，不经过 Remotion
FPS = 30


def track(tmp_path):
    """0.5 秒（15 帧）一循环的「曲子」：音量随时间起伏的正弦波，首尾接得上。"""
    return sine_with(
        tmp_path / "track.wav", "0.5*(0.6+0.4*sin(2*PI*2*t))*sin(2*PI*440*t)", 0.5
    )


def sine_with(path, expr, seconds):
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi"]
        + ["-i", f"aevalsrc='{expr}':s=48000:d={seconds}", str(path)],
        check=True,
    )
    return path


def render(tmp_path, source, frames, extra_filter=""):
    """像 Remotion 那样把曲子循环到 `frames` 帧，音量 -20 dB，最后 60 帧线性淡出到 0。"""
    seconds = frames / FPS
    fade = f"afade=t=out:st={seconds - 2}:d=2:curve=tri"
    stem = tmp_path / "stem.wav"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-stream_loop", "-1", "-i", str(source)]
        + ["-t", f"{seconds}", "-af", f"volume=-20dB,{fade}{extra_filter}", str(stem)],
        check=True,
    )
    mp4 = tmp_path / "episode.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi"]
        + ["-i", f"color=black:s=64x64:r={FPS}:d={seconds}", "-i", str(stem)]
        + ["-c:v", "libx264", "-c:a", "aac", "-b:a", "192k", str(mp4)],
        check=True,
    )
    return mp4, stem


def plan(frames):
    return {
        "fps": FPS,
        "totalFrames": frames,
        "music": {
            "track": "t",
            "file": "music/track.wav",
            "fadeFrom": frames - 60,
            "loopFrames": 15,
            "volumeDb": -20,
        },
    }


def public(tmp_path):
    (tmp_path / "public" / "music").mkdir(parents=True)
    track(tmp_path / "public" / "music")
    return tmp_path / "public"


def test_a_cleanly_looped_and_faded_music_bed_passes(tmp_path):
    public_dir = public(tmp_path)
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 120)

    report = check_music(mp4, stem, plan(120), public_dir)

    assert report.problems == []
    # 120 帧里 15 帧一循环：接缝在第 15、30、……、105 帧，逐个列出
    assert [line.split("（")[0] for line in report.seams] == [
        f"接缝第 {f} 帧" for f in range(15, 120, 15)
    ]


def test_a_gap_at_a_seam_is_reported(tmp_path):
    public_dir = public(tmp_path)
    # 第 30 帧（1.0 秒）的接缝处掉了 50 毫秒
    gap = ",volume=enable='between(t,1.0,1.05)':volume=0"
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 120, gap)

    report = check_music(mp4, stem, plan(120), public_dir)

    assert any("第 30" in problem for problem in report.problems)
    assert any("配乐声轨在接缝附近 1.0" in problem for problem in report.problems)
    assert any("成片在接缝附近" in problem for problem in report.problems)


def test_music_shorter_than_the_video_is_reported(tmp_path):
    public_dir = public(tmp_path)
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 120, ",atrim=0:3")

    report = check_music(mp4, stem, plan(120), public_dir)

    assert any(problem.startswith("音频流 3.0") for problem in report.problems)
