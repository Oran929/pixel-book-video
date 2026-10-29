"""旁白稿的机械检查：`pixelbook check <旁白稿>`。

先读格式（`script.load_script`，格式不对时报第一处错），格式对了再逐条跑规则，
全部问题一次列出。对照大纲的规则用同一章 `outline.yaml` 里和期目录同名的那一期；
找不到这一期时只报一条，这些规则不跑。每条规则是一个函数，收到 `Context`，返回它发现的 `Finding`；
新规则写成同样的函数加进 `RULES`。报错影响退出码，警告只列出。
"""

import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from pixelbook.convert import Chapter, read_chapter
from pixelbook.episode_path import FACTCHECK_NAME, EpisodePath
from pixelbook.factcheck import FactcheckError, load_factcheck
from pixelbook.outline import SECONDS, Episode, OutlineError, clock, load_outline
from pixelbook.script import Script, ScriptError, load_script, text_length

ERROR = "报错"
WARNING = "警告"
# 估算时长的语速：字数口径和字幕计数相同（去掉空白后的字符数，只数字幕 `text`）
CHARS_PER_MINUTE = 250
# 旁白句和它引用的段落有这么多字连续相同（去掉空白和标点后）时，警告照搬原文
COPIED_CHARS = 12
# 不属于某一句的问题（如估算时长）记在这个位置下
WHOLE_SCRIPT = "旁白稿"


@dataclass(frozen=True)
class Finding:
    level: str  # ERROR 或 WARNING
    where: str  # 旁白句 ID（`points` 的问题用画面 ID），或 WHOLE_SCRIPT
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
    # 大纲里的这一期；找不到时为 None，对照大纲的规则不跑
    outline: Episode | None


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


def title_is_topic(context: Context) -> list[Finding]:
    """`title` 就是大纲给这一期定的主题；主题只在大纲里改，再同步到旁白稿。"""
    outline = context.outline
    if outline is None or context.script.title == outline.topic:
        return []
    return [
        Finding(
            ERROR,
            WHOLE_SCRIPT,
            f"`title` 是「{context.script.title}」，"
            f"但大纲里 {outline.id} 的主题 `topic` 是「{outline.topic}」",
        )
    ]


def segments_follow_outline(context: Context) -> list[Finding]:
    """段和大纲里这一期的段一一对应：个数、顺序、标题都相同。"""
    outline = context.outline
    if outline is None:
        return []
    ours = [segment.title for segment in context.script.segments]
    planned = [segment.title for segment in outline.segments]
    if ours == planned:
        return []
    return [
        Finding(
            ERROR,
            WHOLE_SCRIPT,
            f"段标题依次是{_quoted(ours)}，但大纲里 {outline.id} 的段依次是"
            f"{_quoted(planned)}",
        )
    ]


def _quoted(titles: list[str]) -> str:
    return "".join(f"「{title}」" for title in titles)


def points_covered(context: Context) -> list[Finding]:
    """本期大纲的每条观点至少被一个画面讲到；画面只能引用本期的观点。"""
    outline = context.outline
    if outline is None:
        return []
    known = [point.id for point in outline.points]
    scenes = [scene for segment in context.script.segments for scene in segment.scenes]
    findings = []
    for scene in scenes:
        if unknown := [p for p in scene.points if p not in known]:
            findings.append(
                Finding(
                    ERROR,
                    scene.id,
                    f"`points` 里的 {'、'.join(unknown)} 不是大纲里 {outline.id} 的观点",
                )
            )
    covered = {p for scene in scenes for p in scene.points}
    findings += [
        Finding(
            ERROR,
            WHOLE_SCRIPT,
            f"大纲里 {outline.id} 的观点 {point} 没有被任何画面的 `points` 讲到",
        )
        for point in known
        if point not in covered
    ]
    return findings


def cite_in_scope(context: Context) -> list[Finding]:
    """出处落在本期 `units` 或段落范围之外时警告：偶尔引用别处可以，审稿时要看得到。"""
    if context.outline is None:
        return []
    scope = _scope(context.outline, context.chapter)
    paragraphs = context.chapter.paragraphs
    findings = []
    for line in context.script.lines:
        # 编号不存在的由 `cite_exists` 报
        if outside := [i for i in line.cite if i in paragraphs and i not in scope]:
            findings.append(
                Finding(
                    WARNING,
                    line.id,
                    f"`cite` 里的 {'、'.join(outside)} 不在本期覆盖的单元或段落范围里",
                )
            )
    return findings


def not_copied(context: Context) -> list[Finding]:
    """旁白句和它引用的任一段落有 12 个字以上连续相同时警告：尽量不用原文措辞。

    只比较字幕 `text` 和文字段，两边都先去掉空白和标点。
    """
    paragraphs = context.chapter.paragraphs
    findings = []
    for line in context.script.lines:
        text = _bare(line.text)
        for cited in line.cite:
            paragraph = paragraphs.get(cited)
            if paragraph is None or paragraph.is_image:
                continue
            copied = _longest_common(text, _bare(paragraph.text))
            if len(copied) >= COPIED_CHARS:
                findings.append(
                    Finding(
                        WARNING,
                        line.id,
                        f"和 {cited} 有 {len(copied)} 个字连续相同（{copied}），"
                        "疑似照搬原文",
                    )
                )
    return findings


def factcheck_matches(context: Context) -> list[Finding]:
    """`factcheck.yaml` 存在时，格式要对，并且和旁白稿逐句对应：每句一条判定，不多不少，
    每句的字幕和出处与核对时相同（核对之后改过的句子要重新核对）。

    格式错误只报第一处，不再对照。核对结果不存在时不检查（还没跑 `/factcheck`）。
    """
    path = context.episode.factcheck
    if not path.is_file():
        return []
    try:
        report = load_factcheck(path)
    except FactcheckError as error:
        return [Finding(ERROR, WHOLE_SCRIPT, f"`{FACTCHECK_NAME}` 格式不对：{error}")]
    judged = {verdict.id: verdict for verdict in report.lines}
    lines = {line.id for line in context.script.lines}
    findings = []
    for line in context.script.lines:
        verdict = judged.get(line.id)
        if verdict is None:
            findings.append(
                Finding(ERROR, line.id, f"`{FACTCHECK_NAME}` 里没有这一句的判定")
            )
        elif (verdict.text, verdict.cite) != (line.text, line.cite):
            findings.append(
                Finding(
                    ERROR,
                    line.id,
                    f"字幕或出处和 `{FACTCHECK_NAME}` 里核对过的不同，"
                    "核对之后改过这一句",
                )
            )
    findings += [
        Finding(
            ERROR,
            verdict.id,
            f"`{FACTCHECK_NAME}` 里有这一句的判定，但旁白稿里没有这一句",
        )
        for verdict in judged.values()
        if verdict.id not in lines
    ]
    return findings


RULES: list[Rule] = [
    cite_exists,
    cite_has_text,
    estimated_duration,
    title_is_topic,
    segments_follow_outline,
    points_covered,
    cite_in_scope,
    not_copied,
    factcheck_matches,
]


def check_script(path: Path, rules: list[Rule] = RULES) -> Report:
    """用 `rules` 检查 `path` 这份旁白稿。期目录布局不对、转换结果不存在时抛出异常，不出报告。"""
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
    outline, problem = _outline_episode(episode)
    findings = [Finding(ERROR, WHOLE_SCRIPT, problem)] if problem else []
    context = Context(
        path, episode, script, read_chapter(converted), converted.name, outline
    )
    findings += [finding for rule in rules for finding in rule(context)]
    return Report(
        errors=[f for f in findings if f.level == ERROR],
        warnings=[f for f in findings if f.level == WARNING],
    )


def _outline_episode(episode: EpisodePath) -> tuple[Episode | None, str | None]:
    """大纲里和期目录同名的那一期；找不到时返回原因。"""
    if not episode.outline.is_file():
        return None, f"找不到大纲 {episode.outline}，先写大纲再写旁白稿"
    try:
        outline = load_outline(episode.outline)
    except OutlineError as error:
        return None, f"大纲格式不对，先跑 `pixelbook outline` 修好：{error}"
    for item in outline.episodes:
        if item.id == episode.dir.name:
            return item, None
    return None, f"大纲 {episode.outline} 里没有 {episode.dir.name} 这一期"


def _bare(text: str) -> str:
    """去掉空白和标点（Unicode 类别 P*）。"""
    return "".join(
        c for c in text if not c.isspace() and unicodedata.category(c)[0] != "P"
    )


def _longest_common(short: str, long: str) -> str:
    """`short` 里同时出现在 `long` 里的最长连续片段。旁白句不超过 20 字，直接枚举。"""
    for size in range(len(short), 0, -1):
        for start in range(len(short) - size + 1):
            if (piece := short[start : start + size]) in long:
                return piece
    return ""


def _scope(outline: Episode, chapter: Chapter) -> set[str]:
    """本期覆盖的段落编号。大纲本身的问题（单元不存在、范围不对）由 `pixelbook outline` 报，
    这里跳过。"""
    scope: set[str] = set()
    for covered in outline.units:
        unit = chapter.units.get(covered.unit)
        if unit is None:
            continue
        paragraphs = unit.paragraphs
        if covered.start in paragraphs and covered.end in paragraphs:
            start = paragraphs.index(covered.start)
            paragraphs = paragraphs[start : paragraphs.index(covered.end) + 1]
        scope.update(paragraphs)
    return scope


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
