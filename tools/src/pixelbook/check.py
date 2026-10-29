"""旁白稿的机械检查：`pixelbook check <旁白稿>`。

先读格式（`script.load_script`，格式不对时报第一处错），格式对了再逐条跑规则，
全部问题一次列出。每条规则是一个函数，收到 `Context`，返回它发现的 `Finding`；
新规则写成同样的函数加进 `RULES`。报错影响退出码，警告只列出。
"""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from pixelbook.convert import Chapter, read_chapter
from pixelbook.episode_path import EpisodePath
from pixelbook.outline import SECONDS, clock
from pixelbook.script import Script, ScriptError, load_script, text_length

ERROR = "报错"
WARNING = "警告"
# 估算时长的语速：字数口径和字幕计数相同（去掉空白后的字符数，只数字幕 `text`）
CHARS_PER_MINUTE = 250
# 不属于某一句的问题（如估算时长）记在这个位置下
WHOLE_SCRIPT = "旁白稿"


@dataclass(frozen=True)
class Finding:
    level: str  # ERROR 或 WARNING
    where: str  # 旁白句 ID，或 WHOLE_SCRIPT
    message: str


@dataclass(frozen=True)
class Context:
    """规则能用到的全部输入。"""

    path: Path
    episode: EpisodePath
    script: Script
    chapter: Chapter
    # 转换结果的文件名，写进报错里，如 `ch02.md`
    source: str


@dataclass(frozen=True)
class Report:
    errors: list[Finding]
    warnings: list[Finding]

    @property
    def passed(self) -> bool:
        return not self.errors


Rule = Callable[[Context], list[Finding]]


def cite_exists(context: Context) -> list[Finding]:
    """出处编号都要在该章的转换结果里。"""
    findings = []
    for line in context.script.lines:
        if missing := [i for i in line.cite if i not in context.chapter.paragraphs]:
            findings.append(
                Finding(
                    ERROR,
                    line.id,
                    f"`cite` 里的 {'、'.join(missing)} 在 {context.source} 里不存在",
                )
            )
    return findings


def cite_has_text(context: Context) -> list[Finding]:
    """出处里至少有一个文字段，每句都要有能核对的文字依据。编号不存在的由 `cite_exists` 报。"""
    paragraphs = context.chapter.paragraphs
    return [
        Finding(
            ERROR,
            line.id,
            f"`cite` 只引用了图片段（{'、'.join(line.cite)}），至少要有一个文字段",
        )
        for line in context.script.lines
        if all(i in paragraphs and paragraphs[i].is_image for i in line.cite)
    ]


def estimated_duration(context: Context) -> list[Finding]:
    """按 250 字/分钟估算的时长要在 4:00–6:00 内（含两端，按秒取整）。"""
    chars = sum(text_length(line.text) for line in context.script.lines)
    seconds = round(chars * 60 / CHARS_PER_MINUTE)
    low, high = SECONDS
    if low <= seconds <= high:
        return []
    return [
        Finding(
            ERROR,
            WHOLE_SCRIPT,
            f"估算时长 {clock(seconds)}（{chars} 字，按 {CHARS_PER_MINUTE} 字/分钟），"
            f"应该在 {clock(low)}–{clock(high)} 内",
        )
    ]


RULES: list[Rule] = [cite_exists, cite_has_text, estimated_duration]


def check_script(path: Path) -> Report:
    """检查 `path` 这份旁白稿。期目录布局不对、转换结果不存在时抛出异常，不出报告。"""
    episode = EpisodePath.from_script(path)
    converted = episode.chapter.converted
    if not converted.is_file():
        raise ScriptError(
            f"{path}: 转换结果 {converted} 不存在，先跑 `pixelbook convert <书目录>`"
        )
    try:
        script = load_script(path)
    except ScriptError as error:
        # 格式错误只报第一处；路径在报告最后一行已经有了
        message = str(error).removeprefix(f"{path}: ")
        return Report([Finding(ERROR, WHOLE_SCRIPT, message)], [])
    context = Context(path, episode, script, read_chapter(converted), converted.name)
    findings = [finding for rule in RULES for finding in rule(context)]
    return Report(
        errors=[f for f in findings if f.level == ERROR],
        warnings=[f for f in findings if f.level == WARNING],
    )


def format_report(path: Path, report: Report) -> str:
    """报错和警告分成两块，每条以旁白句 ID 开头。"""
    blocks = [
        _block(ERROR, report.errors),
        _block(WARNING, report.warnings),
        f"{path}: 旁白稿检查{'通过' if report.passed else '没有通过'}",
    ]
    return "\n".join(blocks)


def _block(title: str, findings: list[Finding]) -> str:
    if not findings:
        return f"{title}：无"
    listed = "\n".join(f"  {f.where}：{f.message}" for f in findings)
    return f"{title}（{len(findings)} 条）：\n{listed}"
