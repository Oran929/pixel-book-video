"""配乐检查（#39，#52 改成交叉淡化循环）：配乐声轨和参照（按排期交叉淡化、淡出的原曲）逐帧比电平。"""

import subprocess

import numpy as np
import pytest

from pixelbook.music_check import (
    SAMPLE_RATE,
    MusicSchedule,
    check_music,
    duration_problems,
    frame_levels,
    music_problems,
    music_reference,
    seam_windows,
    silences,
    sound_problems,
    stream_seconds,
    unexplained_silences,
)

# 参照：按排期放出来的配乐的逐帧 RMS（dBFS），起伏像音乐
REFERENCE = [-50.0 - (f % 7) for f in range(200)]


def test_music_following_the_reference_at_a_constant_offset_passes():
    # 渲染出来整体比参照高 0.3 dB（编码、Remotion 的音量取整）
    stem = [db + 0.3 for db in REFERENCE]

    assert music_problems(stem, REFERENCE, start=0, end=200) == []


def test_a_dropout_at_a_crossfade_is_reported_with_its_frames():
    stem = list(REFERENCE)
    stem[100] -= 12  # 第 100 帧（交叉淡化里）掉下去 12 dB
    stem[101] = float("-inf")  # 第 101 帧整帧没有声音

    problems = music_problems(stem, REFERENCE, start=0, end=200)

    assert len(problems) == 1
    assert problems[0].startswith("第 100–101 帧的配乐比参照偏了 -inf dB")


def test_a_pop_is_reported():
    stem = list(REFERENCE)
    stem[60] += 9

    assert music_problems(stem, REFERENCE, start=0, end=200) == [
        "第 60 帧的配乐比参照偏了 +9.0 dB（允许 ±1 dB，台阶边上按前后一帧放宽）"
    ]


def test_a_volume_step_landing_up_to_a_frame_off_passes():
    # 淡出的一级台阶（-6 dB）：参照在第 150 帧降下去，渲染出来早了半帧
    # （Remotion 的音量按帧中点切换，又按音频包生效），第 149 帧只降了一半
    reference = [-50.0] * 150 + [-56.0] * 50
    stem = [-50.0] * 149 + [-53.0] + [-56.0] * 50

    assert music_problems(stem, reference, start=0, end=200) == []


def test_a_fade_that_is_missing_is_reported():
    # 参照在最后 60 帧一路降下去，渲染出来没有淡出
    reference = [-50.0] * 140 + [-50.0 - (f + 1) * 0.3 for f in range(60)]
    stem = [-50.0] * 200

    problems = music_problems(stem, reference, start=0, end=200)

    assert len(problems) == 1
    assert problems[0].startswith("第 144–172 帧的配乐比参照偏了 +9.9 dB")


def test_frames_where_the_reference_is_too_quiet_are_not_compared():
    # 淡出到最后、曲子自己的停顿：参照低于 -60 dBFS，差值全是噪声
    reference = [-50.0] * 100 + [-70.0] * 100
    stem = [-50.0] * 100 + [-90.0] * 100

    assert music_problems(stem, reference, start=0, end=200) == []


def test_frames_outside_the_music_are_not_compared():
    stem = [float("-inf")] * 20 + REFERENCE[20:]

    assert music_problems(stem, REFERENCE, start=20, end=200) == []


def test_silences_near_a_crossfade_that_the_reference_also_has_are_part_of_the_music():
    # 曲子自己在 10.0–10.1 秒有个停顿；交叉淡化在 34–35 秒，那里多出一段静音
    reference = [(10.0, 10.1), (40.0, 40.2)]
    found = [(10.0, 10.1), (34.28, 34.35), (40.01, 40.2)]

    within = seam_windows([(9.5, 10.5), (34.0, 35.0), (39.5, 40.5)])
    assert unexplained_silences(found, reference, within=within) == [(34.28, 34.35)]


def test_silences_away_from_the_crossfades_are_not_counted():
    within = seam_windows([(34.0, 35.0)])
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


# 参照和全长试验的整套检查：用 ffmpeg 合成「曲子」、配乐声轨和成片，不经过 Remotion
FPS = 30
PER_FRAME = SAMPLE_RATE // FPS


def track(directory):
    """3 秒（90 帧）的「曲子」：白噪声（曲尾和曲首互不相关，像两段不同的乐句），RMS 约 -15 dBFS。"""
    path = directory / "track.wav"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi"]
        + ["-i", f"anoisesrc=d=3:c=white:a=0.3:r={SAMPLE_RATE}:s=7", str(path)],
        check=True,
    )
    return path


def public(tmp_path):
    (tmp_path / "public" / "music").mkdir(parents=True)
    track(tmp_path / "public" / "music")
    return tmp_path / "public"


def plays(start, end, track_frames=90, overlap=30):
    """和 video/src/music/crossfade.ts 的 musicPlays 一样排出每次循环（测试里照着写）。"""
    result, f = [], start
    while f < end:
        loops = f + track_frames < end
        result.append(
            {
                "from": f,
                "to": min(f + track_frames, end),
                "fadeIn": {"from": f, "to": f + overlap} if result else None,
                "fadeOut": (
                    {"from": f + track_frames - overlap, "to": f + track_frames}
                    if loops
                    else None
                ),
            }
        )
        if not loops:
            break
        f += track_frames - overlap
    return result


def plan(frames, start=0, end=None):
    end = frames if end is None else end
    return {
        "fps": FPS,
        "totalFrames": frames,
        "music": {
            "track": "t",
            "file": "music/track.wav",
            "startFrame": start,
            "endFrame": end,
            "fadeFrom": end - 60,
            "trackFrames": 90,
            "plays": plays(start, end),
            "crossfadeFrames": 30,
            "volumeDb": -20,
        },
    }


def schedule(timeline):
    return MusicSchedule.from_json(timeline["music"])


def render(tmp_path, source, frames, extra_filter="", start=0, end=None, fade=True):
    """不经过 Remotion，用 ffmpeg 自己的交叉淡化（acrossfade，曲线 qsin：等功率）把曲子
    循环成配乐声轨：从第 `start` 帧放到第 `end` 帧，每次重叠 1 秒，音量 -20 dB，`end` 之前
    60 帧线性淡出到 0；其余是静音，一共 `frames` 帧。再和黑画面合成成片。

    音量像 Remotion 那样每帧一级、取整到 1/97（`volume` 滤镜按 1600 个采样一包逐包求值），
    `fade=False` 时不淡出、音量是不取整的 0.1。"""
    seconds = frames / FPS
    end = frames if end is None else end
    music_seconds = (end - start) / FPS
    copies = len(plays(start, end))
    inputs = []
    for _ in range(copies):
        inputs += ["-i", str(source)]
    chain = "[0:a]"
    graph = []
    for i in range(1, copies):
        graph.append(f"{chain}[{i}:a]acrossfade=d=1:c1=qsin:c2=qsin[x{i}]")
        chain = f"[x{i}]"
    frames_of_music = end - start
    volume = (
        f"asetnsamples=n={PER_FRAME}:p=0,volume=eval=frame:volume="
        f"'round(97*0.1*clip(({frames_of_music}-floor(t*{FPS}+0.5))/60,0,1))/97'"
        if fade
        else "volume=0.1"
    )
    delay = f",adelay={round(start / FPS * 1000)}:all=1" if start else ""
    graph.append(
        f"{chain}atrim=0:{music_seconds},{volume}{delay},"
        f"apad=whole_dur={seconds}{extra_filter}[out]"
    )
    stem = tmp_path / "stem.wav"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y"]
        + inputs
        + ["-filter_complex", ";".join(graph), "-map", "[out]", "-ac", "2"]
        + [str(stem)],
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


def test_the_reference_crossfades_each_loop_and_fades_out(tmp_path):
    public_dir = public(tmp_path)
    out = tmp_path / "reference.wav"

    music_reference(schedule(plan(200, start=20)), 200, FPS, public_dir, out)
    levels = frame_levels(out, FPS)
    track_db = np.median(frame_levels(public_dir / "music" / "track.wav", FPS))

    assert len(levels) == 200
    # 片头期间没有配乐
    assert all(db == float("-inf") for db in levels[:20])
    # 音量 -20 dB（Remotion 的音量取整：0.1 → 10/97，约 +0.26 dB；单声道曲子转成立体声
    # 每个声道再低 3 dB，和 Remotion 渲染出来的一样）
    steady = np.median(levels[20:80])
    assert steady == pytest.approx(track_db - 20 + 0.26 - 3.01, abs=0.3)
    # 交叉淡化处（第 80–109 帧；第 140–169 帧的那一处已经在淡出里）和别处一样响
    assert all(abs(db - steady) < 1.0 for db in levels[80:110])
    # 最后 60 帧淡出：最后一帧比整体低 30 dB 以上
    assert levels[199] < steady - 30


def test_the_reference_places_each_play_at_a_whole_millisecond_like_remotion(tmp_path):
    # Remotion 用 adelay 把每份音频放到整毫秒上：第 1 帧是 33.33 毫秒，放在第 33 毫秒，
    # 也就是第 33 × 48 = 1584 个采样（不是 1600）
    public_dir = public(tmp_path)
    out = tmp_path / "reference.wav"

    music_reference(schedule(plan(200, start=1)), 200, FPS, public_dir, out)
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(out), "-f", "f32le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    samples = np.frombuffer(raw, dtype="<f4").reshape(-1, 2)

    assert np.flatnonzero(np.abs(samples[:, 0]) > 0)[0] == 1584


def test_a_cleanly_crossfaded_and_faded_music_bed_passes(tmp_path):
    public_dir = public(tmp_path)
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 200)

    report = check_music(mp4, stem, plan(200), public_dir)

    assert report.problems == []
    # 3 秒的曲子每 60 帧（2 秒）循环一次，交叉淡化在第 60–89、120–149 帧
    assert [line.split("（")[0] for line in report.seams] == [
        "交叉淡化第 60–89 帧",
        "交叉淡化第 120–149 帧",
    ]


def test_a_gap_at_a_crossfade_is_reported(tmp_path):
    public_dir = public(tmp_path)
    # 第 60–89 帧（2–3 秒）的交叉淡化里掉了 50 毫秒
    gap = ",volume=enable='between(t,2.5,2.55)':volume=0"
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 200, gap)

    report = check_music(mp4, stem, plan(200), public_dir)

    assert any(problem.startswith("第 75") for problem in report.problems)
    assert any("配乐声轨在交叉淡化附近 2.5" in problem for problem in report.problems)
    assert any("成片在交叉淡化附近" in problem for problem in report.problems)


def test_a_missing_fade_out_is_reported(tmp_path):
    public_dir = public(tmp_path)
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 200, fade=False)

    report = check_music(mp4, stem, plan(200), public_dir)

    assert any("偏了 +" in problem for problem in report.problems)


def test_music_shorter_than_the_video_is_reported(tmp_path):
    public_dir = public(tmp_path)
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 200, ",atrim=0:3")

    report = check_music(mp4, stem, plan(200), public_dir)

    assert any(problem.startswith("音频流 3.0") for problem in report.problems)


def test_music_starting_after_the_intro_passes(tmp_path):
    # 片头（#50）占前 30 帧，配乐从第 30 帧起循环，交叉淡化跟着后移
    public_dir = public(tmp_path)
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 230, start=30)

    report = check_music(mp4, stem, plan(230, start=30), public_dir)

    assert report.problems == []
    assert [line.split("（")[0] for line in report.seams] == [
        "交叉淡化第 90–119 帧",
        "交叉淡化第 150–179 帧",
    ]


def test_music_playing_during_the_intro_is_reported(tmp_path):
    # 排期说配乐从第 30 帧开始，渲染出来却从第 0 帧就有
    public_dir = public(tmp_path)
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 230)

    report = check_music(mp4, stem, plan(230, start=30), public_dir)

    assert any(
        problem.startswith("片头期间（第 0–29 帧）配乐声轨就有声音")
        for problem in report.problems
    )


def test_music_ending_where_the_outro_starts_passes(tmp_path):
    # 片尾（#51）占最后 30 帧：配乐在第 200 帧（正文结束）前淡完，片尾期间没有配乐
    public_dir = public(tmp_path)
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 230, end=200)

    report = check_music(mp4, stem, plan(230, end=200), public_dir)

    assert report.problems == []


def test_music_playing_during_the_outro_is_reported(tmp_path):
    # 排期说配乐在第 200 帧结束，渲染出来却一直放到最后
    public_dir = public(tmp_path)
    mp4, stem = render(tmp_path, public_dir / "music" / "track.wav", 230)

    report = check_music(mp4, stem, plan(230, end=200), public_dir)

    assert any(
        problem.startswith("片尾期间（第 200–229 帧）配乐声轨还有声音")
        for problem in report.problems
    )


def test_remotion_like_volume_steps_slightly_out_of_line_with_the_reference_pass(
    tmp_path,
):
    """Remotion 的音量是每帧一级台阶（取整到 1/97，按帧中点、按音频包切换），台阶边上的
    帧和参照对不齐。照这个样子造一份声轨（台阶早半帧），再整体错开 16 个采样（#50、#51 里
    旧的参照没按整毫秒放，就差这么多，淡出检查因此报了「回升」），检查应当通过。"""
    public_dir = public(tmp_path)
    music = schedule(plan(200))
    reference = tmp_path / "reference.wav"
    music_reference(music, 200, FPS, public_dir, reference)
    clean = tmp_path / "clean.wav"
    music_reference(music, 200, FPS, public_dir, clean, lead_frames=0.5)
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(clean), "-f", "f32le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    samples = np.frombuffer(raw, dtype="<f4").reshape(-1, 2)
    shifted = np.concatenate([np.zeros((16, 2), "<f4"), samples[:-16]])
    stem = tmp_path / "stem.wav"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SAMPLE_RATE)]
        + ["-ac", "2", "-i", "-", "-c:a", "pcm_f32le", str(stem)],
        input=shifted.tobytes(),
        check=True,
    )

    assert (
        music_problems(
            frame_levels(stem, FPS),
            frame_levels(reference, FPS),
            start=0,
            end=200,
        )
        == []
    )
