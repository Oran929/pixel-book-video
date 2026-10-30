"""`pixelbook status`：只看文件判断一期做到哪一步、停在哪个人工关口、下一步跑什么。

阶段的定义见 docs/reference/status.md。
"""

import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from pixelbook.book import BOOK_CONFIG, load_book_config
from pixelbook.episode_path import ChapterPath, EpisodePath, EpisodePathError
from pixelbook.outline import Episode, OutlineError, load_outline
from pixelbook.pronunciation import PRONUNCIATION_FILE
from pixelbook.script import FINAL, ScriptError, load_script
from pixelbook.voice import VoiceConfigError
from pixelbook.voice_lock import DEFAULT_VOICE


class StatusError(Exception):
    pass


@dataclass(frozen=True)
class Status:
    """`stage` 是阶段 ID，`label` 是中文名；`gate` 是人工关口编号（1–3），不在关口时为
    None。`next` 是 agent 下一步依次要跑的命令或 skill，停在关口或已完成时为空；
    `review` 是关口上交给人审的内容。`stale` 列出比输入旧的产物，`rerun_from` 是从哪一步重跑。
    """

    episode: str
    stage: str
    label: str
    gate: int | None = None
    next: list[str] = field(default_factory=list)
    review: str | None = None
    stale: list[str] = field(default_factory=list)
    rerun_from: str | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "stage": self.stage,
            "label": self.label,
            "gate": self.gate,
            "next": self.next,
            "review": self.review,
            "stale": self.stale,
            "rerun_from": self.rerun_from,
        }

    def to_text(self) -> str:
        gate = f"（人工关口 {self.gate}）" if self.gate else ""
        lines = [f"期目录：{self.episode}", f"阶段：{self.label}{gate}"]
        if self.stale:
            lines.append(f"产物过期，从「{self.rerun_from}」重跑：")
            lines += [f"  {reason}" for reason in self.stale]
        if self.review:
            lines.append(f"待审：{self.review}")
        if self.next:
            lines.append("下一步：")
            lines += [f"  {step}" for step in self.next]
        elif not self.review:
            lines.append("下一步：无")
        return "\n".join(lines)


def episode_status(path: Path) -> Status:
    """`path` 是期目录；不是合法的期目录时抛 StatusError。"""
    episode = _episode(path)
    root = _repo_root(episode.chapter_dir)

    def rel(file: Path) -> str:
        return file.relative_to(root).as_posix()

    name = episode.dir.name
    book, chapter = episode.book_dir.name, episode.chapter_dir.name

    def status(stage: str, label: str, **fields: Any) -> Status:
        return Status(rel(episode.dir), stage, label, **fields)

    entry = _outline_entry(episode.outline, name)
    if entry is None:
        return status(
            "not-in-outline", "大纲里没有这一期", next=[f"/outline {book} {chapter}"]
        )
    if _committed_outline_entry(root, episode.outline, name) != entry:
        return status(
            "outline-review",
            "大纲待审",
            gate=1,
            review=f"大纲 {rel(episode.outline)}；审过后提交",
        )
    if not episode.script.exists():
        return status("no-script", "没有旁白稿", next=[f"/script {rel(episode.dir)}"])

    script = rel(episode.script)
    if not episode.factcheck.exists():
        return status(
            "script-review", "旁白稿待审", next=[f"/factcheck {rel(episode.dir)}"]
        )
    if _script_status(episode.script) != FINAL:
        return status(
            "script-review",
            "旁白稿待审",
            gate=2,
            review=f"旁白稿 {script} 和语义核对结果 {rel(episode.factcheck)}；"
            "审过后按 /script 第 7 步定稿、提交",
        )

    def stale(product: tuple[str, Path], *inputs: tuple[str, Path]) -> list[str]:
        """`product` 比哪些输入旧，每个一条原因。"""
        name, path = product
        return [
            f"{name} {rel(path)} 比{input_name} {rel(input_path)} 旧"
            for input_name, input_path in inputs
            if input_path.stat().st_mtime > path.stat().st_mtime
        ]

    manifest = ("合成清单", episode.manifest)
    storyboard = ("分镜", episode.storyboard)
    timeline = ("时间轴", episode.timeline)

    voice = [f"pixelbook terms {script}", f"pixelbook voice {script}"]
    if not episode.manifest.exists():
        return status("ready-to-voice", "定稿待配音", next=voice)
    old = stale(manifest, *_voicing_inputs(root, episode))
    if old:
        return status(
            "ready-to-voice", "定稿待配音", next=voice, stale=old, rerun_from="配音"
        )
    if not episode.storyboard.exists():
        return status(
            "no-storyboard", "没有分镜", next=[f"/storyboard {rel(episode.dir)}"]
        )
    render = [f"pixelbook render {script}"]
    if not (episode.timeline.exists() and episode.video.exists()):
        return status("ready-to-render", "待渲染", next=render)
    for step, old in (
        ("时间轴", stale(timeline, manifest, storyboard)),
        ("渲染", stale(("成片", episode.video), timeline)),
    ):
        if old:
            return status(
                "ready-to-render", "待渲染", next=render, stale=old, rerun_from=step
            )

    if _committed(root, episode.storyboard):
        return status("done", "已完成")
    credits = f"，配乐署名 {rel(episode.credits)}" if episode.credits.exists() else ""
    return status(
        "video-review",
        "成片待审",
        gate=3,
        review=f"成片 {rel(episode.video)}{credits}，和 /storyboard 汇报的「表现不了」清单；"
        "审过后提交分镜 storyboard.json",
    )


def _episode(path: Path) -> EpisodePath:
    try:
        episode = EpisodePath(path)
        ChapterPath(episode.chapter_dir)  # 章目录名要是 chNN
    except EpisodePathError as error:
        raise StatusError(str(error)) from error
    if not episode.chapter_dir.is_dir():
        raise StatusError(f"{episode.chapter_dir} 不存在，期目录要放在已有的章目录下")
    if path.exists() and not path.is_dir():
        raise StatusError(f"{path} 不是目录")
    return episode


def _repo_root(path: Path) -> Path:
    result = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise StatusError(f"{path} 不在 Git 仓库里，没法判断大纲审过没有")
    return Path(result.stdout.strip()).resolve()


def _committed(root: Path, path: Path) -> bool:
    """`path` 已经提交进 Git，而且工作区和暂存区都没有改动（审过才提交）。"""
    tracked = subprocess.run(
        ["git", "-C", str(root), "ls-files", "--error-unmatch", "--", str(path)],
        capture_output=True,
        check=False,
    )
    if tracked.returncode != 0:
        return False
    changes = subprocess.run(
        ["git", "-C", str(root), "status", "--porcelain", "--", str(path)],
        capture_output=True,
        text=True,
        check=True,
    )
    return changes.stdout.strip() == ""


def _voicing_inputs(root: Path, episode: EpisodePath) -> list[tuple[str, Path]]:
    """配音读的文件：旁白稿、读音表、书配置、书用的音色配置（存在的才算）。"""
    inputs = [
        ("旁白稿", episode.script),
        ("读音表", root / PRONUNCIATION_FILE),
        ("书配置", episode.book_dir / BOOK_CONFIG),
    ]
    try:
        voice = load_book_config(episode.book_dir).voice or DEFAULT_VOICE
        inputs.append(("音色配置", root / voice))
    except (VoiceConfigError, yaml.YAMLError):
        pass  # 书配置格式不对时配音会报错；这里只比还能确定的输入
    return [(name, path) for name, path in inputs if path.is_file()]


def _outline_entry(outline: Path, name: str) -> Episode | None:
    """工作区大纲里这一期的条目；没有大纲或没有这一期时是 None。"""
    if not outline.exists():
        return None
    try:
        loaded = load_outline(outline)
    except (OutlineError, yaml.YAMLError) as error:
        raise StatusError(
            f"大纲格式不对，先跑 pixelbook outline 修好：{_reason(error, outline)}"
        ) from error
    return next((e for e in loaded.episodes if e.id == name), None)


def _committed_outline_entry(root: Path, outline: Path, name: str) -> Episode | None:
    """HEAD 里大纲中这一期的条目（审过才提交）；没提交过或格式不对时是 None。"""
    shown = subprocess.run(
        [
            "git",
            "-C",
            str(root),
            "show",
            f"HEAD:{outline.relative_to(root).as_posix()}",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if shown.returncode != 0:
        return None
    try:
        loaded = load_outline(outline, shown.stdout)
    except (OutlineError, yaml.YAMLError):
        return None
    return next((e for e in loaded.episodes if e.id == name), None)


def _script_status(script: Path) -> str:
    try:
        return load_script(script).status
    except (ScriptError, yaml.YAMLError) as error:
        raise StatusError(
            f"旁白稿格式不对，先跑 pixelbook check 修好：{_reason(error, script)}"
        ) from error


def _reason(error: Exception, path: Path) -> str:
    if isinstance(error, yaml.YAMLError):
        return f"{path} 不是合法的 YAML：{error}"
    return str(error)
