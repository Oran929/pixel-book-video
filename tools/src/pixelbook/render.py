"""一键渲染：旁白稿 → 配音 → 时间轴 → MP4 → 核对时长（票 11）。

四步依次运行，任何一步失败就停下，抛出 `RenderError`，写明是哪一步、原因是什么。
复核未通过的句子、总时长超出 4:00–6:00 都不算失败，只列进汇总。
"""

import json
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any

from pixelbook import REPO_ROOT
from pixelbook.episode_path import EpisodePathError
from pixelbook.pipeline import PipelineError, VoicingSettings, voice_episode
from pixelbook.pronunciation import PronunciationError
from pixelbook.script import ScriptError
from pixelbook.voice import VoiceConfigError

VIDEO_DIR = REPO_ROOT / "video"
TIMELINE_NAME = "timeline.json"
SEGMENTS_NAME = "segments.txt"
# 曲子文件的获取方法（曲子文件只留在本机，#53）
MUSIC_README = "video/public/music/README.md"
STEPS = ("配音", "时间轴", "渲染", "核对时长")
# 失败时最多附上命令输出的最后几行
OUTPUT_TAIL = 30


class RenderError(Exception):
    def __init__(self, step: str, reason: str) -> None:
        self.step = step
        super().__init__(
            f"第 {STEPS.index(step) + 1} 步「{step}」失败：{reason.rstrip()}"
        )


def render_episode(
    script_path: Path,
    settings: VoicingSettings,
    out: Path,
    draft: bool = False,
    log: Callable[[str], None] = lambda _: None,
) -> dict[str, Any]:
    """把 `script_path` 这一期渲染成 `out`，返回汇总报告。

    `settings.public_dir` 是 Remotion 的静态目录（正式运行是 `video/public/`；
    冒烟测试用临时目录，免得覆盖上屏的那一期）。`log` 在每一步开始时收到一行进度。
    汇总里的 `asr_failures`、`asr_pinyin_passes` 是配音返回的报告条目
    （`pipeline.AsrReportEntry`）。
    """
    episode_dir = script_path.parent

    log(_progress("配音"))
    try:
        report = voice_episode(script_path, settings, draft=draft).report
    except (
        EpisodePathError,
        PipelineError,
        ScriptError,
        PronunciationError,
        VoiceConfigError,
    ) as error:
        raise RenderError("配音", str(error)) from error

    log(_progress("时间轴"))
    _run(
        "时间轴",
        ["npm", "--prefix", str(VIDEO_DIR), "run", "-s", "timeline", "--"]
        + [str(episode_dir)],
    )
    timeline_path = episode_dir / TIMELINE_NAME
    timeline = json.loads(timeline_path.read_text())

    log(_progress("渲染"))
    _require_music_file(timeline, settings.public_dir)
    out.parent.mkdir(parents=True, exist_ok=True)
    _run(
        "渲染",
        ["npx", "remotion", "render", "Episode", str(out)]
        + ["--public-dir", str(settings.public_dir), "--log", "error"],
        cwd=VIDEO_DIR,
    )

    log(_progress("核对时长"))
    frames, total_frames = check_frames(out, timeline_path)
    return {
        "mp4": str(out),
        "frames": frames,
        "total_frames": total_frames,
        "fps": timeline["fps"],
        "duration": timeline["duration"],
        "segments": str(episode_dir / SEGMENTS_NAME),
        "asr_failures": report.asr_failures,
        "asr_pinyin_passes": report.asr_pinyin_passes,
    }


def _require_music_file(timeline: dict[str, Any], public_dir: Path) -> None:
    """曲子文件只留在本机、不进 Git（#53）：分镜选的那首不在静态目录里时，
    在渲染前停下并指向获取说明，不让 Remotion 报一串看不懂的错。"""
    music = timeline.get("music")
    if music is None or (public_dir / music["file"]).is_file():
        return
    raise RenderError(
        "渲染",
        f"配乐文件 {music['file']} 不在 {public_dir} 里（曲子文件不进 Git），"
        f"获取方法见 {MUSIC_README}",
    )


def render_music_stem(out: Path, public_dir: Path) -> None:
    """只渲染配乐（Remotion 的 EpisodeMusic 合成，和 Episode 同一份排期）成 wav。

    全长试验（#39）用它单独检查配乐的循环接缝和淡出。要在 `render_episode` 之后运行：
    用的是那一步放进 `public_dir` 的合成清单和分镜。
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    _run(
        "渲染",
        ["npx", "remotion", "render", "EpisodeMusic", str(out), "--codec", "wav"]
        + ["--public-dir", str(public_dir), "--log", "error"],
        cwd=VIDEO_DIR,
    )


def check_frames(mp4: Path, timeline_path: Path) -> tuple[int, int]:
    """MP4 视频流的帧数和时间轴的总帧数相差不超过一帧，返回（帧数，总帧数）。

    不比较音频流：最后一句的音频可能比视频短。
    """
    probe = _run(
        "核对时长",
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets"]
        + ["-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(mp4)],
    )
    frames = int(probe.strip())
    total_frames = json.loads(timeline_path.read_text())["totalFrames"]
    if abs(frames - total_frames) > 1:
        raise RenderError(
            "核对时长",
            f"{mp4} 的视频流有 {frames} 帧，时间轴 {timeline_path} 的总帧数是 "
            f"{total_frames}，相差超过一帧",
        )
    return frames, total_frames


def _progress(step: str) -> str:
    return f"[{STEPS.index(step) + 1}/{len(STEPS)}] {step}"


def _run(step: str, command: list[str], cwd: Path | None = None) -> str:
    try:
        result = subprocess.run(
            command, cwd=cwd, capture_output=True, text=True, check=False
        )
    except FileNotFoundError as error:
        raise RenderError(step, f"找不到命令 {command[0]}") from error
    if result.returncode != 0:
        output = (result.stderr.strip() or result.stdout.strip()).splitlines()
        tail = "\n".join(output[-OUTPUT_TAIL:])
        raise RenderError(
            step,
            f"`{' '.join(command)}` 以退出码 {result.returncode} 结束：\n{tail}",
        )
    return result.stdout
