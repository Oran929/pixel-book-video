"""配乐检查（#39）：成片里的配乐有没有按排期循环、在最后淡出。

做法是逐帧比电平：参照是原曲首尾相接、不调音量（ffmpeg `-stream_loop`），和渲染出来的
配乐声轨逐帧比 RMS（dBFS，ffmpeg `astats`）。配乐的音量是常数，所以淡出之前两者的差应当
处处一样；循环接缝接错位、掉帧、爆音都会让差偏离。淡出段的差应当一路往下走。
"""

import re
import subprocess
from dataclasses import dataclass
from itertools import pairwise
from pathlib import Path
from statistics import median

# 量电平时统一重采样到的采样率（Remotion 渲染出的音轨就是 48 kHz）
SAMPLE_RATE = 48000
# 静音判定：低于 -50 dBFS、持续 20 毫秒以上
SILENCE_DB = -50
SILENCE_SECONDS = 0.02
# 参照低于这个电平的帧（曲子里的停顿）不比：差值全是噪声
FLOOR_DB = -60.0
# 音效那一帧至少要比配乐高出这么多 dB
SOUND_DB = 3.0
# 接缝前后各看几帧的电平（写进报告）
SEAM_FRAMES = 3
# 接缝前后看多少秒的静音
SEAM_WINDOW_SECONDS = 1.0
# 淡出段里，后一帧比前一帧高出这么多 dB 以内算测量误差
FADE_SLACK_DB = 0.3
# 淡出到最后至少要比整体音量低这么多 dB
FADE_DROP_DB = 20.0
# 淡出之前，每帧的差偏离整体音量超过这么多 dB 就算异常跳变
TOLERANCE_DB = 1.0


def music_problems(
    stem: list[float], reference: list[float], *, fade_from: int
) -> list[str]:
    """`stem` 是配乐声轨的逐帧电平，`reference` 是同样长的参照；返回发现的问题。"""
    gains = _gains(stem, reference)
    gain = _steady_gain(gains, fade_from)
    if gain is None:
        return [f"淡出之前没有可比的帧（参照全低于 {FLOOR_DB} dBFS）"]
    off = [
        f
        for f, g in enumerate(gains[:fade_from])
        if g is not None and abs(g - gain) > TOLERANCE_DB
    ]
    problems = []
    for start, end in _runs(off):
        worst = max(
            (gains[f] - gain for f in range(start, end + 1) if gains[f] is not None),
            key=abs,
        )
        problems.append(
            f"{_frames(start, end)}的配乐比参照偏了 {worst:+.1f} dB"
            f"（整体 {gain:+.1f} dB，允许 ±{TOLERANCE_DB} dB）"
        )
    return problems + _fade_problems(gains, gain, fade_from)


def _gains(levels: list[float], reference: list[float]) -> list[float | None]:
    """逐帧比参照高多少 dB；参照低于 FLOOR_DB 的帧为 None。"""
    return [s - r if r >= FLOOR_DB else None for s, r in zip(levels, reference)]


def _steady_gain(gains: list[float | None], fade_from: int) -> float | None:
    """淡出之前的整体音量（逐帧差的中位数）。"""
    steady = [g for g in gains[:fade_from] if g is not None]
    return median(steady) if steady else None


def _fade_problems(gains: list[float | None], gain: float, fade_from: int) -> list[str]:
    """淡出段（`fade_from` 到最后一帧）：电平单调下降，并且最后降得足够多。"""
    fading = [(f, g) for f, g in enumerate(gains) if f >= fade_from and g is not None]
    problems = [
        f"淡出没有单调下降：第 {f} 帧比上一帧高 {g - before:.1f} dB"
        f"（允许 {FADE_SLACK_DB} dB 的测量误差）"
        for (_, before), (f, g) in pairwise(fading)
        if g - before > FADE_SLACK_DB
    ]
    if fading and gain - fading[-1][1] < FADE_DROP_DB:
        problems.append(
            f"淡出到最后只降了 {gain - fading[-1][1]:.1f} dB，"
            f"应当至少降 {FADE_DROP_DB:.0f} dB"
        )
    return problems


def intro_problems(stem: list[float], start: int) -> list[str]:
    """配乐声轨在第 `start` 帧（片头结束）之前应当是静音：配乐不覆盖片头（#50）。"""
    loud = [f for f, level in enumerate(stem[:start]) if level > SILENCE_DB]
    if not loud:
        return []
    span = _frames(loud[0], loud[-1])
    return [
        f"片头期间（第 0–{start - 1} 帧）配乐声轨就有声音：{span}高于 {SILENCE_DB} dBFS"
    ]


def duration_problems(*, video: float, audio: float, fps: int) -> list[str]:
    """音频流和视频流一样长（相差不超过一帧）：配乐覆盖整期，音频不会比视频短。"""
    if abs(video - audio) <= 1 / fps:
        return []
    return [f"音频流 {audio:.3f} 秒，视频流 {video:.3f} 秒，相差超过一帧"]


def sound_problems(
    mix: list[float], reference: list[float], sound_frames: list[int]
) -> list[str]:
    """配乐垫底时检查音效准时响起（冒烟测试用；旁白是静音）。

    `mix` 是成片的逐帧电平，`reference` 是配乐的参照，`sound_frames` 是排期里音效的帧。
    每个音效的帧要比配乐高出 `SOUND_DB` 以上；第一个音效之前只有配乐。
    """
    gains = _gains(mix, reference)
    gain = _steady_gain(gains, len(gains))
    if gain is None:
        return [f"没有可比的帧（参照全低于 {FLOOR_DB} dBFS）"]
    problems = []
    for f in sound_frames:
        # 配乐在这一帧正好停顿时，按 FLOOR_DB 算配乐的电平
        rise = mix[f] - max(reference[f], FLOOR_DB) - gain
        if rise < SOUND_DB:
            problems.append(
                f"第 {f} 帧的音效听不出来：比配乐只高 {rise:.1f} dB，"
                f"至少要高 {SOUND_DB:.0f} dB"
            )
    first = min(sound_frames, default=len(gains))
    early = [
        (f, g - gain)
        for f, g in enumerate(gains[:first])
        if g is not None and g - gain > TOLERANCE_DB
    ]
    if early:
        f, rise = early[0]
        problems.append(
            f"第一个音效（第 {first} 帧）之前，第 {f} 帧就有别的声音"
            f"（比配乐高 {rise:.1f} dB）"
        )
    return problems


def seam_windows(
    seams: list[float], window: float = SEAM_WINDOW_SECONDS
) -> list[tuple[float, float]]:
    """每个接缝（秒）前后 `window` 秒的区间。"""
    return [(t - window, t + window) for t in seams]


def unexplained_silences(
    found: list[tuple[float, float]],
    reference: list[tuple[float, float]],
    *,
    within: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """`within` 这些区间（秒）里找到的静音，去掉参照在同一时间也有的（那是曲子自己的停顿）。

    参照的静音和找到的有重叠就算同一段：渲染后的编码会让边界差几毫秒。
    """

    def overlaps(a: tuple[float, float], b: tuple[float, float]) -> bool:
        return a[0] < b[1] and b[0] < a[1]

    return [
        silence
        for silence in found
        if any(overlaps(silence, span) for span in within)
        and not any(overlaps(silence, quiet) for quiet in reference)
    ]


def _frames(start: int, end: int) -> str:
    return f"第 {start} 帧" if start == end else f"第 {start}–{end} 帧"


def _runs(frames: list[int]) -> list[tuple[int, int]]:
    """把排好序的帧号合并成连续的区间（含两端）。"""
    runs: list[tuple[int, int]] = []
    for f in frames:
        if runs and runs[-1][1] == f - 1:
            runs[-1] = (runs[-1][0], f)
        else:
            runs.append((f, f))
    return runs


@dataclass
class MusicCheck:
    """全长试验的配乐检查结果：每个接缝一行，和发现的问题（没有问题时为空）。"""

    seams: list[str]
    problems: list[str]


def check_music(mp4: Path, stem: Path, timeline: dict, public_dir: Path) -> MusicCheck:
    """检查成片 `mp4` 和只有配乐的声轨 `stem`（Remotion 的 EpisodeMusic 合成）。

    `timeline` 是 `timeline.json` 的内容；曲子文件在 `public_dir` 下。查五样：
    音频流和视频流一样长；配乐从 `startFrame`（片头结束，#50）才开始，之前声轨是静音；
    配乐声轨和参照逐帧比，淡出之前音量处处一样（接缝不跳变）、淡出段单调下降；
    每个接缝前后，声轨和成片里都没有参照之外的静音。
    """
    fps, total, music = timeline["fps"], timeline["totalFrames"], timeline["music"]
    fade_from, start = music["fadeFrom"], music.get("startFrame", 0)
    track = public_dir / music["file"]
    seconds = stream_seconds(mp4)
    problems = duration_problems(
        video=seconds["video"], audio=seconds["audio"], fps=fps
    )

    # 参照：片头期间是静音（比 FLOOR_DB 低，不参与比较），之后原曲首尾相接
    reference = [float("-inf")] * start + frame_levels(
        track, fps, loop_frames=total - start
    )
    levels = frame_levels(stem, fps)[:total]
    problems += intro_problems(levels, start)
    problems += music_problems(levels, reference, fade_from=fade_from)

    seams = list(range(start + music["loopFrames"], total, music["loopFrames"]))
    # 曲子自己的停顿（后移到配乐开始的位置），外加片头期间本来就没有配乐
    quiet = [
        (a + start / fps, b + start / fps)
        for a, b in silences(
            track, loop_seconds=(total - start) / fps, gain_db=music["volumeDb"]
        )
    ] + ([(0.0, start / fps)] if start else [])
    # 淡出段本来就会变成静音，不看
    windows = [
        (max(a, start / fps), min(b, fade_from / fps))
        for a, b in seam_windows([f / fps for f in seams])
        if a < fade_from / fps
    ]
    extra = {
        name: unexplained_silences(silences(path), quiet, within=windows)
        for name, path in (("配乐声轨", stem), ("成片", mp4))
    }
    for name, found in extra.items():
        problems += [
            f"{name}在接缝附近 {a:.3f}–{b:.3f} 秒有参照里没有的静音" for a, b in found
        ]

    gains = _gains(levels, reference)
    gain = _steady_gain(gains, fade_from) or 0
    lines = []
    for f in seams:
        near = [
            abs(g - gain)
            for g in gains[max(0, f - SEAM_FRAMES) : f + SEAM_FRAMES]
            if g is not None
        ]
        window = (f / fps - SEAM_WINDOW_SECONDS, f / fps + SEAM_WINDOW_SECONDS)
        found = sum(
            1
            for silence in extra["配乐声轨"] + extra["成片"]
            if silence[0] < window[1] and window[0] < silence[1]
        )
        deviation = f"{max(near):.2f} dB" if near else "参照太轻，没法比"
        lines.append(
            f"接缝第 {f} 帧（{f / fps:.3f} 秒）：前后 {SEAM_FRAMES} 帧电平偏离最大 "
            f"{deviation}；多出来的静音 {found} 段"
        )
    return MusicCheck(seams=lines, problems=problems)


def _input(path: Path, loop_seconds: float | None) -> list[str]:
    """ffmpeg 的输入参数；`loop_seconds` 不为空时把文件首尾相接，截到这么长（秒）。"""
    if loop_seconds is None:
        return ["-i", str(path)]
    return ["-stream_loop", "-1", "-i", str(path), "-t", f"{loop_seconds}"]


def _ffmpeg_filter(path: Path, audio_filter: str, loop_seconds: float | None) -> str:
    """对音频跑一遍 ffmpeg 滤镜，返回 stdout 和 stderr（滤镜的输出在其中一处）。"""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats"]
        + _input(path, loop_seconds)
        + ["-vn", "-af", audio_filter, "-f", "null", "-"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout + result.stderr


def frame_levels(
    path: Path, fps: int, *, loop_frames: int | None = None
) -> list[float]:
    """逐帧的 RMS 电平（dBFS，各声道合计；静音是 -inf），用 ffmpeg `astats` 量。

    `loop_frames` 不为空时把文件首尾相接，量出正好这么多帧（参照用）。
    """
    loop_seconds = None if loop_frames is None else loop_frames / fps
    per_frame = SAMPLE_RATE // fps
    output = _ffmpeg_filter(
        path,
        f"aresample={SAMPLE_RATE},asetnsamples=n={per_frame}:p=0,"
        "astats=metadata=1:reset=1,"
        "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
        loop_seconds,
    )
    levels = [
        float(v) for v in re.findall(r"lavfi\.astats\.Overall\.RMS_level=(\S+)", output)
    ]
    return levels if loop_frames is None else levels[:loop_frames]


def silences(
    path: Path, *, loop_seconds: float | None = None, gain_db: float = 0
) -> list[tuple[float, float]]:
    """ffmpeg `silencedetect` 找出的静音区间（秒）；文件末尾的静音没有结束时间，算到无穷远。

    `gain_db` 先调音量再找（参照要和成片里的配乐一样响）。
    """
    output = _ffmpeg_filter(
        path,
        f"volume={gain_db}dB,silencedetect=noise={SILENCE_DB}dB:d={SILENCE_SECONDS}",
        loop_seconds,
    )
    starts = [float(v) for v in re.findall(r"silence_start: (-?[\d.]+)", output)]
    ends = [float(v) for v in re.findall(r"silence_end: (-?[\d.]+)", output)]
    ends += [float("inf")] * (len(starts) - len(ends))
    return list(zip(starts, ends, strict=True))


def stream_seconds(mp4: Path) -> dict[str, float]:
    """ffprobe 读出的各个流的时长（秒），键是 `video`、`audio`。"""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,duration"]
        + ["-of", "csv=p=0", str(mp4)],
        capture_output=True,
        text=True,
        check=True,
    )
    rows = (line.split(",") for line in result.stdout.split())
    return {kind: float(seconds) for kind, seconds in rows}
