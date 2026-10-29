"""配乐检查（#39，#52 改成交叉淡化循环）：成片里的配乐有没有按排期循环、交叉淡化、在最后淡出。

做法是造一份参照再逐帧比电平：参照照 `timeline.json` 里的排期（每次循环的起止帧、交叉淡化的
帧区间、音量、正文最后的淡出）把原曲放出来（`music_reference`，numpy 混音），和渲染出来的
配乐声轨逐帧比 RMS（dBFS，ffmpeg `astats`）。两者应当处处一样（差一个常数）；交叉淡化处
掉音、爆音，循环接错位、掉帧，淡出没做或做错，都会让差偏离。

参照的音量公式和 `video/src/music/crossfade.ts` 的 `musicVolume` 一样（等功率交叉淡化、线性
淡出），在这里独立写一遍，用来核对 Remotion 渲染出来的结果。
"""

import math
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from statistics import median

import numpy as np

# 量电平时统一重采样到的采样率（Remotion 渲染出的音轨就是 48 kHz）
SAMPLE_RATE = 48000
# 静音判定：低于 -50 dBFS、持续 20 毫秒以上
SILENCE_THRESHOLD_DB = -50
SILENCE_SECONDS = 0.02
# 参照低于这个电平的帧（曲子里的停顿、淡出的最后几帧）不比：差值全是噪声
# （和 `video/src/music/seam.ts` 的 `COMPARE_FLOOR_DB` 同名同值）
COMPARE_FLOOR_DB = -60.0
# 音效那一帧至少要比配乐高出这么多 dB
SOUND_DB = 3.0
# 交叉淡化前后看多少秒的静音
SEAM_WINDOW_SECONDS = 1.0
# 每帧的差偏离整体超过这么多 dB 就算掉音或爆音。音量变化的地方（交叉淡化、淡出的台阶）
# 按前后一帧的参照放宽：Remotion 按帧中点、按音频包切换音量，台阶会错开不到一帧
TOLERANCE_DB = 1.0
# Remotion 渲染时，一份音频的音量在它的时间段里有变化，就取整到 1/97 的整数倍
# （`@remotion/renderer` 的 `roundVolumeToAvoidStackOverflow`），参照照样取整
REMOTION_VOLUME_STEPS = 97


@dataclass(frozen=True)
class FrameSpan:
    """帧区间 [start, end)（`timeline.json` 里写作 `from`、`to`）。"""

    start: int
    end: int

    @classmethod
    def from_json(cls, span: dict | None) -> "FrameSpan | None":
        return None if span is None else cls(span["from"], span["to"])


@dataclass(frozen=True)
class MusicPlay:
    """一次循环（和 crossfade.ts 的 `MusicPlay` 一样）：从 `start` 放到 `end`（不含），
    `fade_in`、`fade_out` 是和上一次、下一次重叠的帧区间（没有为 None）。"""

    start: int
    end: int
    fade_in: FrameSpan | None
    fade_out: FrameSpan | None


@dataclass(frozen=True)
class MusicSchedule:
    """`timeline.json` 的 `music`（时间轴导出命令算好的排期，这里原样用，ADR-0004）。"""

    track: str
    file: str
    start_frame: int
    end_frame: int
    fade_from: int
    track_frames: int
    crossfade_frames: int
    plays: list[MusicPlay]
    volume_db: float

    @classmethod
    def from_json(cls, music: dict) -> "MusicSchedule":
        return cls(
            track=music["track"],
            file=music["file"],
            start_frame=music["startFrame"],
            end_frame=music["endFrame"],
            fade_from=music["fadeFrom"],
            track_frames=music["trackFrames"],
            crossfade_frames=music["crossfadeFrames"],
            plays=[
                MusicPlay(
                    p["from"],
                    p["to"],
                    FrameSpan.from_json(p["fadeIn"]),
                    FrameSpan.from_json(p["fadeOut"]),
                )
                for p in music["plays"]
            ],
            volume_db=music["volumeDb"],
        )

    @property
    def seams(self) -> list[FrameSpan]:
        """每个接缝交叉淡化的帧区间（第二次起每次循环的淡入）。"""
        return [p.fade_in for p in self.plays if p.fade_in is not None]


def music_problems(
    stem: list[float], reference: list[float], *, start: int, end: int
) -> list[str]:
    """`stem` 是配乐声轨的逐帧电平，`reference` 是参照；比第 `start` 到 `end`（不含）帧。

    参照低于 `COMPARE_FLOOR_DB` 的帧不比。整体的差取中位数；每帧的电平超出「前后一帧的
    参照电平加上整体的差」`TOLERANCE_DB` 以上，算问题，连续的帧合成一段报。
    """
    return _compare_music(stem, reference, start=start, end=end)[1]


def _compare_music(
    stem: list[float], reference: list[float], *, start: int, end: int
) -> tuple[float, list[str]]:
    """`music_problems` 的做法，连同整体的差（没有可比的帧时为 0）一起返回。"""
    compared = [f for f in range(start, end) if reference[f] >= COMPARE_FLOOR_DB]
    if not compared:
        return 0.0, [
            f"第 {start}–{end - 1} 帧没有可比的帧（参照全低于 {COMPARE_FLOOR_DB} dBFS）"
        ]
    gain = median(stem[f] - reference[f] for f in compared)

    def deviation(f: int) -> float:
        """超出允许范围多少 dB（在范围里是 0），负数是掉音，正数是爆音。"""
        # 前后一帧的参照不论多轻都算进来：挨着几乎无声的帧，这一帧可以有一部分是静音
        near = [reference[g] for g in range(max(start, f - 1), min(end, f + 2))]
        low = min(near) + gain - TOLERANCE_DB
        high = max(near) + gain + TOLERANCE_DB
        if stem[f] < low or stem[f] > high:
            return stem[f] - (reference[f] + gain)
        return 0.0

    off = {f: d for f in compared if (d := deviation(f)) != 0}
    problems = []
    for first, last in _runs(sorted(off)):
        worst = max((off[f] for f in range(first, last + 1) if f in off), key=abs)
        problems.append(
            f"{_frames(first, last)}的配乐比参照偏了 {worst:+.1f} dB"
            f"（允许 ±{TOLERANCE_DB:.0f} dB，台阶边上按前后一帧放宽）"
        )
    return gain, problems


def _volume(music: MusicSchedule, play: MusicPlay, frame: int) -> float:
    """第 `frame` 帧这次循环的线性音量（和 crossfade.ts 的 `musicVolume` 一样）。"""
    gain = 10 ** (music.volume_db / 20)
    for span, curve in ((play.fade_in, math.sin), (play.fade_out, math.cos)):
        if span and span.start <= frame < span.end:
            progress = (frame - span.start + 0.5) / (span.end - span.start)
            gain *= curve(math.pi / 2 * progress)
    if frame >= music.fade_from:
        gain *= max(
            0.0, (music.end_frame - frame) / (music.end_frame - music.fade_from)
        )
    return gain


def _remotion_volumes(volumes: list[float]) -> list[float]:
    """像 Remotion 那样取整：音量处处一样时原样用，有变化时取整到 1/97 的整数倍（3 位小数）。"""
    if len(set(volumes)) == 1:
        return volumes
    steps = REMOTION_VOLUME_STEPS
    return [round(math.floor(v * steps + 0.5) / steps, 3) for v in volumes]


def music_reference(
    music: MusicSchedule,
    total_frames: int,
    fps: int,
    public_dir: Path,
    out: Path,
    *,
    lead_frames: float = 0,
) -> Path:
    """照排期把原曲放成一份 `total_frames` 帧长的参照，写成 48 kHz 立体声 wav（`out`）。

    `music` 是 `timeline.json` 的 `music` 排期：每次循环（`plays`）从曲首放起，每帧乘
    `_volume` 的音量（取整同 Remotion），叠在一起。每次循环的起点像 Remotion 那样放在整毫秒上
    （它用 `adelay=<毫秒>` 摆放每份音频，第 f 帧放在 round(f / fps × 1000) 毫秒，比整帧最多差
    1/3 毫秒，48 kHz 下 16 个采样）。音量按整帧切换；`lead_frames` 让每级台阶提前这么多帧
    （测试里用 0.5 模仿 Remotion 按帧中点切换）。
    """
    per_frame = SAMPLE_RATE // fps
    track = _decode(public_dir / music.file)
    mix = np.zeros((total_frames * per_frame, 2), dtype=np.float64)
    lead = round(lead_frames * per_frame)
    for play in music.plays:
        frames = play.end - play.start
        volumes = _remotion_volumes(
            [_volume(music, play, f) for f in range(play.start, play.end)]
        )
        # 每个采样的音量：第 i 个采样属于第 (i + lead) // per_frame 帧
        index = np.minimum(
            (np.arange(frames * per_frame) + lead) // per_frame, frames - 1
        )
        gains = np.asarray(volumes)[index]
        at = math.floor(play.start * 1000 / fps + 0.5) * SAMPLE_RATE // 1000
        # 起点挪到整毫秒后，最后一次循环可能伸出总长一点点，截掉
        segment = track[: min(frames * per_frame, len(mix) - at)]
        mix[at : at + len(segment)] += segment * gains[: len(segment), None]
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SAMPLE_RATE)]
        + ["-ac", "2", "-i", "-", "-c:a", "pcm_f32le", str(out)],
        input=mix.astype("<f4").tobytes(),
        check=True,
    )
    return out


def _decode(path: Path) -> np.ndarray:
    """解码成 48 kHz 立体声浮点采样（单声道的曲子两个声道一样，和 Remotion 渲染出来的一样）。"""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ar", str(SAMPLE_RATE)]
        + ["-ac", "2", "-f", "f32le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, 2)


def bookend_silence_problems(
    stem: list[float], frames: range, part: str, already: str
) -> list[str]:
    """配乐声轨在 `frames` 这些帧里应当是静音：配乐不覆盖片头（#50）、片尾（#51）。

    `part` 是这段的说法（「片头期间」「片尾期间」），`already` 是报问题时的语气（「就」「还」）。
    """
    loud = [f for f in frames if stem[f] > SILENCE_THRESHOLD_DB]
    if not loud:
        return []
    span = _frames(loud[0], loud[-1])
    where = f"{part}（第 {frames.start}–{frames.stop - 1} 帧）"
    return [f"{where}配乐声轨{already}有声音：{span}高于 {SILENCE_THRESHOLD_DB} dBFS"]


def duration_problems(*, video: float, audio: float, fps: int) -> list[str]:
    """音频流和视频流一样长（相差不超过一帧）：配乐覆盖整期，音频不会比视频短。"""
    if abs(video - audio) <= 1 / fps:
        return []
    return [f"音频流 {audio:.3f} 秒，视频流 {video:.3f} 秒，相差超过一帧"]


def _gains(levels: list[float], reference: list[float]) -> list[float | None]:
    """逐帧比参照高多少 dB；参照低于 COMPARE_FLOOR_DB 的帧为 None。"""
    return [s - r if r >= COMPARE_FLOOR_DB else None for s, r in zip(levels, reference)]


def sound_problems(
    mix: list[float], reference: list[float], sound_frames: list[int]
) -> list[str]:
    """配乐垫底时检查音效准时响起（冒烟测试用；旁白是静音）。

    `mix` 是成片的逐帧电平，`reference` 是配乐的参照，`sound_frames` 是排期里音效的帧。
    每个音效的帧要比配乐高出 `SOUND_DB` 以上；第一个音效之前只有配乐。
    """
    gains = _gains(mix, reference)
    steady = [g for g in gains if g is not None]
    if not steady:
        return [f"没有可比的帧（参照全低于 {COMPARE_FLOOR_DB} dBFS）"]
    gain = median(steady)
    problems = []
    for f in sound_frames:
        # 配乐在这一帧正好停顿时，按 COMPARE_FLOOR_DB 算配乐的电平
        rise = mix[f] - max(reference[f], COMPARE_FLOOR_DB) - gain
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
    seams: list[tuple[float, float]], window: float = SEAM_WINDOW_SECONDS
) -> list[tuple[float, float]]:
    """每段交叉淡化（起、止秒）前后各放宽 `window` 秒的区间。"""
    return [(a - window, b + window) for a, b in seams]


def unexplained_silences(
    found: list[tuple[float, float]],
    reference: list[tuple[float, float]],
    *,
    within: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """`within` 这些区间（秒）里找到的静音，去掉参照在同一时间也有的（那是曲子自己的停顿）。

    参照的静音和找到的有重叠就算同一段：渲染后的编码会让边界差几毫秒。
    """
    return [
        silence
        for silence in found
        if any(_overlaps(silence, span) for span in within)
        and not any(_overlaps(silence, quiet) for quiet in reference)
    ]


def _overlaps(a: tuple[float, float], b: tuple[float, float]) -> bool:
    """两个区间（秒）有没有重叠。"""
    return a[0] < b[1] and b[0] < a[1]


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
    """全长试验的配乐检查结果：每段交叉淡化一行，和发现的问题（没有问题时为空）。"""

    seams: list[str]
    problems: list[str]
    reference: Path


def check_music(mp4: Path, stem: Path, timeline: dict, public_dir: Path) -> MusicCheck:
    """检查成片 `mp4` 和只有配乐的声轨 `stem`（Remotion 的 EpisodeMusic 合成）。

    `timeline` 是 `timeline.json` 的内容；曲子文件在 `public_dir` 下。参照写在声轨旁边
    （`<声轨>-reference.wav`，可以拿来对着听）。查五样：音频流和视频流一样长；配乐从
    `startFrame`（片头结束，#50）才开始、到 `endFrame`（正文结束、片尾开始，#51）为止，
    片头片尾期间声轨是静音；配乐声轨和参照逐帧比（`music_problems`），交叉淡化处不掉音、
    不爆音，淡出照排期降下去；每段交叉淡化前后，声轨和成片里都没有参照之外的静音。
    """
    fps, total = timeline["fps"], timeline["totalFrames"]
    music = MusicSchedule.from_json(timeline["music"])
    start, end, fade_from = music.start_frame, music.end_frame, music.fade_from
    seconds = stream_seconds(mp4)
    problems = duration_problems(
        video=seconds["video"], audio=seconds["audio"], fps=fps
    )

    reference_wav = music_reference(
        music, total, fps, public_dir, stem.with_name(f"{stem.stem}-reference.wav")
    )
    reference = _pad(frame_levels(reference_wav, fps), total)
    # 声轨比视频短时（上面已经报了），缺的帧当静音
    levels = _pad(frame_levels(stem, fps), total)
    problems += bookend_silence_problems(levels, range(start), "片头期间", "就")
    problems += bookend_silence_problems(levels, range(end, total), "片尾期间", "还")
    gain, off = _compare_music(levels, reference, start=start, end=end)
    problems += off

    seams = [(seam.start, seam.end) for seam in music.seams]
    quiet = silences(reference_wav)
    # 淡出段本来就会变成静音，不看
    windows = [
        (max(a, start / fps), min(b, fade_from / fps))
        for a, b in seam_windows([(a / fps, b / fps) for a, b in seams])
        if a < fade_from / fps
    ]
    extra = {
        name: unexplained_silences(silences(path), quiet, within=windows)
        for name, path in (("配乐声轨", stem), ("成片", mp4))
    }
    for name, found in extra.items():
        problems += [
            f"{name}在交叉淡化附近 {a:.3f}–{b:.3f} 秒有参照里没有的静音"
            for a, b in found
        ]

    lines = []
    for a, b in seams:
        near = [
            abs(levels[f] - reference[f] - gain)
            for f in range(a, min(b, end))
            if reference[f] >= COMPARE_FLOOR_DB
        ]
        (window,) = seam_windows([(a / fps, b / fps)])
        found = sum(
            1
            for silence in extra["配乐声轨"] + extra["成片"]
            if _overlaps(silence, window)
        )
        deviation = f"{max(near):.2f} dB" if near else "参照太轻，没法比"
        lines.append(
            f"交叉淡化第 {a}–{b - 1} 帧（{a / fps:.3f}–{b / fps:.3f} 秒）："
            f"逐帧电平偏离最大 {deviation}；多出来的静音 {found} 段"
        )
    return MusicCheck(seams=lines, problems=problems, reference=reference_wav)


def _pad(levels: list[float], frames: int) -> list[float]:
    """截到或补到 `frames` 帧，补的是静音。"""
    return levels[:frames] + [float("-inf")] * (frames - len(levels))


def _ffmpeg_filter(path: Path, audio_filter: str) -> str:
    """对音频跑一遍 ffmpeg 滤镜，返回 stdout 和 stderr（滤镜的输出在其中一处）。"""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path)]
        + ["-vn", "-af", audio_filter, "-f", "null", "-"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout + result.stderr


def frame_levels(path: Path, fps: int) -> list[float]:
    """逐帧的 RMS 电平（dBFS，各声道合计；静音是 -inf），用 ffmpeg `astats` 量。"""
    per_frame = SAMPLE_RATE // fps
    output = _ffmpeg_filter(
        path,
        f"aresample={SAMPLE_RATE},asetnsamples=n={per_frame}:p=0,"
        "astats=metadata=1:reset=1,"
        "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
    )
    return [
        float(v) for v in re.findall(r"lavfi\.astats\.Overall\.RMS_level=(\S+)", output)
    ]


def silences(path: Path) -> list[tuple[float, float]]:
    """ffmpeg `silencedetect` 找出的静音区间（秒）；文件末尾的静音没有结束时间，算到无穷远。"""
    output = _ffmpeg_filter(
        path, f"silencedetect=noise={SILENCE_THRESHOLD_DB}dB:d={SILENCE_SECONDS}"
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
