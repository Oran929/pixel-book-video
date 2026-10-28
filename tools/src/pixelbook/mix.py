"""试听拼接：按 TS 导出的 `timeline.json` 把一期的逐句配音拼成一条试听音轨。

停顿规则只在 TypeScript 的时间轴里（ADR-0003）；这里只读每句的开始帧，
不知道停顿是多少秒。试听音轨不是正式产物（Remotion 逐句放音频）。
"""

import json
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

from pixelbook.audio import wav_seconds


class MixError(Exception):
    pass


@dataclass(frozen=True)
class TimedAudio:
    id: str
    # 以 video/public/ 为起点的路径
    audio: str
    start_frame: int


@dataclass(frozen=True)
class Timeline:
    fps: int
    total_frames: int
    lines: list[TimedAudio]

    @property
    def seconds(self) -> float:
        return self.total_frames / self.fps


def load_timeline(path: Path) -> Timeline:
    """读并校验 `timeline.json`；格式不对时报错，逐个写明字段位置。

    只校验拼接用到的字段（帧率、总帧数、每句的 ID、音频、开始帧），
    其余字段（画面、段……）不管，TS 一侧以后加字段也不影响这里。
    """
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        raise MixError(f"{path}: 不是合法的 JSON：{error}") from error
    if not isinstance(data, dict):
        raise MixError(f"{path}: 格式不对：\n  应为 JSON 对象")

    issues: list[str] = []

    def field(obj: dict, key: str, where: str, check, expected: str):
        if key not in obj:
            issues.append(f"{where}: 缺少")
        elif not check(obj[key]):
            issues.append(f"{where}: 应为{expected}，实际是 {json.dumps(obj[key])}")
        else:
            return obj[key]
        return None

    fps = field(data, "fps", "fps", lambda v: _is_int(v) and v > 0, "正整数")
    total = field(
        data, "totalFrames", "totalFrames", lambda v: _is_int(v) and v >= 0, "非负整数"
    )
    lines: list[TimedAudio] = []
    raw = field(data, "lines", "lines", lambda v: isinstance(v, list), "数组")
    if raw == []:
        issues.append("lines: 至少要有一句")
    for i, line in enumerate(raw or []):
        at = f"lines[{i}]"
        if not isinstance(line, dict):
            issues.append(f"{at}: 应为 JSON 对象")
            continue
        values = (
            field(line, "id", f"{at}.id", _is_str, "字符串"),
            field(line, "audio", f"{at}.audio", _is_str, "字符串"),
            field(
                line,
                "startFrame",
                f"{at}.startFrame",
                lambda v: _is_int(v) and v >= 0,
                "非负整数",
            ),
        )
        if None not in values:
            lines.append(TimedAudio(*values))
    if issues:
        listing = "\n".join(f"  {issue}" for issue in issues)
        raise MixError(f"{path}: 格式不对：\n{listing}")
    return Timeline(fps=fps, total_frames=total, lines=lines)


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_str(value) -> bool:
    return isinstance(value, str)


def mix_timeline(timeline_path: Path, public_dir: Path, out: Path) -> float:
    """把每句 wav 放在"开始帧 ÷ 帧率"秒处，其余是静音，写成 `out`。

    音轨补静音到时间轴的总时长；拼完测量 `out`，和时间轴总时长相差超过
    一帧就报错。返回音轨时长（秒）。
    """
    timeline = load_timeline(timeline_path)
    wavs = [public_dir / line.audio for line in timeline.lines]
    for line, wav in zip(timeline.lines, wavs, strict=True):
        if not wav.is_file():
            raise MixError(
                f"{timeline_path}: {line.id} 的音频 {line.audio} 不存在"
                f"（在 {public_dir} 下找）。先运行 `pixelbook voice` 把这一期的配音"
                "复制到 video/public/，再重新导出时间轴"
            )
    with wave.open(str(wavs[0]), "rb") as first:
        rate = first.getframerate()

    inputs, chains = [], []
    for i, (line, wav) in enumerate(zip(timeline.lines, wavs, strict=True)):
        inputs += ["-i", str(wav)]
        delay = round(line.start_frame / timeline.fps * rate)
        chains.append(f"[{i}:a]aresample={rate},adelay=delays={delay}S:all=1[a{i}]")
    mixed = "".join(f"[a{i}]" for i in range(len(wavs)))
    total = round(timeline.seconds * rate)
    # 不归一化音量（句子不重叠，原样叠加）；补静音到时间轴总时长，不截断，
    # 这样音频比时间轴长时，下面的时长检查能发现
    mix = f"{mixed}amix=inputs={len(wavs)}:normalize=0:duration=longest"
    graph = ";".join([*chains, f"{mix},apad=whole_len={total}[out]"])
    out.parent.mkdir(parents=True, exist_ok=True)
    command = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", graph]
    command += ["-map", "[out]", "-c:a", "pcm_s16le", str(out)]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise MixError("找不到 ffmpeg：先安装（brew install ffmpeg）") from error
    except subprocess.CalledProcessError as error:
        raise MixError(f"ffmpeg 拼接失败：\n{error.stderr}") from error
    seconds = wav_seconds(out)
    if abs(seconds - timeline.seconds) > 1 / timeline.fps:
        raise MixError(
            f"{out}: 试听音轨 {seconds:.2f} 秒，时间轴 {timeline_path} 是 "
            f"{timeline.seconds:.2f} 秒（{timeline.total_frames} 帧），相差超过一帧。"
            "timeline.json 和配音对不上：重新配音后先重新导出时间轴再拼接"
        )
    return seconds
