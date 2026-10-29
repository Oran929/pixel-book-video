"""旁白稿的机械检查：`pixelbook check <旁白稿>`。

先读格式（`script.load_script`，格式不对时报第一处错），格式对了再逐条跑规则，
全部问题一次列出。对照大纲的规则用同一章 `outline.yaml` 里和期目录同名的那一期；
找不到这一期时只报一条，这些规则不跑。每条规则是一个函数，收到 `Context`，返回它发现的 `Finding`；
新规则写成同样的函数加进 `RULES`。报错影响退出码，警告只列出。

核对结果 `factcheck.yaml` 的对照（`factcheck_matches`）不在 `RULES` 里：`check_script` 在
`RULES` 之后跑它；还没核对或正要重新核对的稿（草稿副本、给裁判出题前）用 `check_unjudged`。
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from pixelbook.convert import Chapter, read_chapter
from pixelbook.copied import bare, copied, copied_message
from pixelbook.episode_path import FACTCHECK_NAME, EpisodePath
from pixelbook.factcheck import FactcheckError, load_factcheck
from pixelbook.outline import (
    SECONDS,
    Episode,
    OutlineError,
    clock,
    episode_scope,
    load_outline,
    outside_scope,
    tip_number_message,
    tip_numbers,
)
from pixelbook.script import FINAL, Script, ScriptError, load_script, text_length


class Level(StrEnum):
    """问题的级别；值是报告里那一块的标题。报错影响退出码，警告只列出。"""

    ERROR = "报错"
    WARNING = "警告"


# 估算时长的语速：字数口径和字幕计数相同（去掉空白后的字符数，只数字幕 `text`）
CHARS_PER_MINUTE = 250
# 不属于某一句的问题（如估算时长）记在这个位置下
WHOLE_SCRIPT = "旁白稿"
# 画面说明里能机械提取的词语：拉丁字母词（DRY、Bug、C++），引号或书名号里的词语，`提示N`
LATIN_TERM = re.compile(r"[A-Za-z][A-Za-z0-9+#]*")
QUOTED_TERM = re.compile(
    r"「([^」]+)」|“([^”]+)”|\"([^\"]+)\"|『([^』]+)』|《([^》]+)》"
)
TIP_TERM = re.compile(r"提示\d+")
# 大纲的 `minutes` 跟着定稿走：每段的估算分钟数取到这个粒度写回大纲（`pixelbook sync-minutes`）
MINUTES_STEP = 0.25


@dataclass(frozen=True)
class Finding:
    level: Level
    where: str  # 旁白句 ID（`points` 的问题用画面 ID），或 WHOLE_SCRIPT
    message: str


@dataclass(frozen=True)
class SegmentTiming:
    id: str
    title: str
    chars: int
    seconds: int
    # 大纲给这一段的时长（秒）和 `minutes`；段和大纲对不上时为 None
    planned: int | None
    minutes: float | None
    # 估算直接取到 `MINUTES_STEP`（至少一个）的分钟数，和 `sync-minutes` 写回大纲的分钟数
    # （见 `synced_minutes`：为了让各段总和落在范围内，可能比直接取整多或少一个 `MINUTES_STEP`）
    rounded_minutes: float
    synced_minutes: float

    @property
    def adjusted(self) -> bool:
        return self.rounded_minutes != self.synced_minutes


@dataclass(frozen=True)
class Timing:
    """按 `CHARS_PER_MINUTE` 估算的时长：全稿和每一段，每段对照大纲的 `minutes`。"""

    chars: int
    seconds: int
    segments: list[SegmentTiming]


def _seconds(chars: int) -> int:
    return round(chars * 60 / CHARS_PER_MINUTE)


def _rounded_minutes(chars: int) -> float:
    rounded = round(chars / CHARS_PER_MINUTE / MINUTES_STEP) * MINUTES_STEP
    return max(MINUTES_STEP, rounded)


def segments_match(script: Script, outline: Episode) -> bool:
    """旁白稿的段和大纲里这一期的段一一对应：个数、顺序、标题都相同。"""
    return [s.title for s in script.segments] == [s.title for s in outline.segments]


def synced_minutes(chars: list[int]) -> list[float]:
    """各段写回大纲的分钟数：估算取到 `MINUTES_STEP`（至少一个 `MINUTES_STEP`）。

    全稿估算在 `SECONDS` 范围内、各段取整后的总和却不在时（每段的误差凑到一起），依次把
    取整误差最大的段（往下舍得最多的先加，往上入得最多的先减；一样大时取前面的段）多取或少取
    一个 `MINUTES_STEP`，直到总和落进范围，这样 `pixelbook outline` 也能通过。
    """
    raw = [n / CHARS_PER_MINUTE for n in chars]
    minutes = [_rounded_minutes(n) for n in chars]
    low, high = (limit / 60 for limit in SECONDS)
    if not low <= sum(raw) <= high:
        return minutes
    while sum(minutes) < low:
        n = max(range(len(raw)), key=lambda i: (raw[i] - minutes[i], -i))
        minutes[n] += MINUTES_STEP
    while sum(minutes) > high:
        shrinkable = [i for i in range(len(raw)) if minutes[i] > MINUTES_STEP]
        n = max(shrinkable, key=lambda i: (minutes[i] - raw[i], -i))
        minutes[n] -= MINUTES_STEP
    return minutes


def estimate(script: Script, outline: Episode | None) -> Timing:
    """字数口径和字幕相同：只数 `text`、去掉空白。段和大纲一一对应（标题依次相同）时才对照。"""
    planned = None
    if outline and segments_match(script, outline):
        planned = [s.minutes for s in outline.segments]
    counts = [
        sum(text_length(line.text) for scene in segment.scenes for line in scene.lines)
        for segment in script.segments
    ]
    synced = synced_minutes(counts)
    segments = []
    for n, segment in enumerate(script.segments):
        chars = counts[n]
        minutes = planned[n] if planned else None
        segments.append(
            SegmentTiming(
                segment.id,
                segment.title,
                chars,
                _seconds(chars),
                round(minutes * 60) if minutes is not None else None,
                minutes,
                _rounded_minutes(chars),
                synced[n],
            )
        )
    chars = sum(counts)
    return Timing(chars, _seconds(chars), segments)


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
    # 旁白稿格式不对时没有估算
    timing: Timing | None = None

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
                    Level.ERROR,
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
            Level.ERROR,
            line.id,
            f"`cite` 只引用了图片段（{'、'.join(line.cite)}），至少要有一个文字段",
        )
        for line in context.script.lines
        if all(i in paragraphs and paragraphs[i].is_image for i in line.cite)
    ]


def estimated_duration(context: Context) -> list[Finding]:
    """按 250 字/分钟估算的时长要在 4:00–6:00 内（含两端，按秒取整）。"""
    timing = estimate(context.script, context.outline)
    chars, seconds = timing.chars, timing.seconds
    low, high = SECONDS
    if low <= seconds <= high:
        return []
    return [
        Finding(
            Level.ERROR,
            WHOLE_SCRIPT,
            f"估算时长 {clock(seconds)}（{chars} 字，按 {CHARS_PER_MINUTE} 字/分钟），"
            f"应该在 {clock(low)}–{clock(high)} 内",
        )
    ]


def minutes_follow_script(context: Context) -> list[Finding]:
    """定稿的旁白稿：大纲给每段的 `minutes` 要等于 `sync-minutes` 写回的值（`synced_minutes`）。

    草稿不查；段和大纲对不上时由 `segments_follow_outline` 报，这里不查。
    """
    if context.script.status != FINAL:
        return []
    findings = []
    for segment in estimate(context.script, context.outline).segments:
        if segment.minutes is None or segment.minutes == segment.synced_minutes:
            continue
        low, high = SECONDS
        adjusted = (
            ""
            if not segment.adjusted
            else f"（让各段总和落在 {clock(low)}–{clock(high)} 内）"
        )
        findings.append(
            Finding(
                Level.ERROR,
                segment.id,
                f"定稿的旁白稿估算 {clock(segment.seconds)}，取到 {MINUTES_STEP:g} 分钟"
                f"{adjusted}是 {segment.synced_minutes:g} 分钟，但大纲给这一段的 `minutes` 是 "
                f"{segment.minutes:g}：跑 `pixelbook sync-minutes {context.path}` "
                "把估算写回大纲",
            )
        )
    return findings


def title_is_topic(context: Context) -> list[Finding]:
    """`title` 就是大纲给这一期定的主题；主题只在大纲里改，再同步到旁白稿。"""
    outline = context.outline
    if outline is None or context.script.title == outline.topic:
        return []
    return [
        Finding(
            Level.ERROR,
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
    if segments_match(context.script, outline):
        return []
    ours = [segment.title for segment in context.script.segments]
    planned = [segment.title for segment in outline.segments]
    return [
        Finding(
            Level.ERROR,
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
    scenes = context.script.scenes
    findings = []
    for scene in scenes:
        if unknown := [p for p in scene.points if p not in known]:
            findings.append(
                Finding(
                    Level.ERROR,
                    scene.id,
                    f"`points` 里的 {'、'.join(unknown)} 不是大纲里 {outline.id} 的观点",
                )
            )
    covered = {p for scene in scenes for p in scene.points}
    findings += [
        Finding(
            Level.ERROR,
            WHOLE_SCRIPT,
            f"大纲里 {outline.id} 的观点 {point} 没有被任何画面的 `points` 讲到",
        )
        for point in known
        if point not in covered
    ]
    return findings


def points_cited(context: Context) -> list[Finding]:
    """讲到一条观点的画面里，至少有一句引用了这条观点的某个出处段落：
    画面标了 `points`，内容却没讲这条观点时报出来。

    没被任何画面讲到的观点由 `points_covered` 报，这里不查。
    """
    if context.outline is None:
        return []
    scenes = context.script.scenes
    findings = []
    for point in context.outline.points:
        telling = [scene for scene in scenes if point.id in scene.points]
        cited = {i for scene in telling for line in scene.lines for i in line.cite}
        if telling and not cited & set(point.cite):
            findings.append(
                Finding(
                    Level.ERROR,
                    WHOLE_SCRIPT,
                    f"讲到观点 {point.id} 的画面（{'、'.join(s.id for s in telling)}）"
                    f"里没有一句引用它的出处 {'、'.join(point.cite)}",
                )
            )
    return findings


def no_tip_numbers(context: Context) -> list[Finding]:
    """标题 `title`、段标题、字幕 `text` 和朗读 `speech` 里不出现书的提示编号（`提示14`、
    `提示 14`、`提示十四`）：编号对观众没有意义，讲提示框的内容就够了。画面说明不查（由
    `description_terms` 对照原文）。"""
    script = context.script
    fields = [(WHOLE_SCRIPT, "title", script.title)]
    fields += [(segment.id, "title", segment.title) for segment in script.segments]
    for line in script.lines:
        fields += [(line.id, "text", line.text), (line.id, "speech", line.speech)]
    return [
        Finding(Level.ERROR, where, tip_number_message(f"`{field}`", number))
        for where, field, value in fields
        for number in tip_numbers(value or "")
    ]


def cite_in_scope(context: Context) -> list[Finding]:
    """出处落在本期 `units` 或段落范围之外时警告：偶尔引用别处可以，审稿时要看得到。"""
    if context.outline is None:
        return []
    scope = episode_scope(context.outline, context.chapter)
    findings = []
    for line in context.script.lines:
        # 编号不存在的由 `cite_exists` 报；章末脚注看它的标记在不在本期范围里
        if outside := outside_scope(line.cite, scope, context.chapter):
            findings.append(
                Finding(
                    Level.WARNING,
                    line.id,
                    f"`cite` 里的 {'、'.join(outside)} 不在本期覆盖的单元或段落范围里",
                )
            )
    return findings


def not_copied(context: Context) -> list[Finding]:
    """旁白句和它引用的任一段落有 `COPIED_CHARS` 个字以上连续相同时警告：尽量不用原文措辞。

    只比较字幕 `text` 和文字段，两边都先去掉空白和标点。
    """
    paragraphs = context.chapter.paragraphs
    return [
        Finding(Level.WARNING, line.id, copied_message(cited, piece))
        for line in context.script.lines
        for cited in line.cite
        if cited in paragraphs and (piece := copied(line.text, paragraphs[cited]))
    ]


def description_terms(context: Context) -> list[Finding]:
    """画面说明里能机械提取的词语要在本章原文（标题和段落）里出现过，没有时警告。

    只查拉丁字母词（整词、不分大小写）、引号和书名号里的词语（两边去掉空白和标点后比较）和
    `提示N`；其他中文概念、名字、物件提取不出来，留给人审。
    """
    corpus = context.chapter.text
    flat = bare(corpus)
    findings = []
    for scene in context.script.scenes:
        for term in _missing_terms(scene.description, corpus, flat):
            findings.append(
                Finding(
                    Level.WARNING,
                    scene.id,
                    f"画面说明里的「{term}」在 {context.source} 里没有出现",
                )
            )
    return findings


def _missing_terms(description: str, corpus: str, flat: str) -> list[str]:
    missing: list[str] = []
    quoted = [
        next(g for g in m.groups() if g) for m in QUOTED_TERM.finditer(description)
    ]
    for term in quoted:
        if bare(term) and bare(term) not in flat:
            missing.append(term)
    # 引号里的拉丁字母词已经整体查过了
    rest = QUOTED_TERM.sub(" ", description)
    for term in LATIN_TERM.findall(rest):
        pattern = rf"(?<![A-Za-z0-9]){re.escape(term)}(?![A-Za-z0-9])"
        if not re.search(pattern, corpus, re.IGNORECASE):
            missing.append(term)
    for term in TIP_TERM.findall(rest):
        if not re.search(rf"{term}(?!\d)", corpus):
            missing.append(term)
    return list(dict.fromkeys(missing))


def factcheck_matches(context: Context) -> list[Finding]:
    """`factcheck.yaml` 存在时，格式要对，并且和旁白稿逐句对应：每句一条判定，不多不少，
    每句的字幕、朗读和出处与核对时相同（核对之后改过的句子要重新核对）。

    格式错误只报第一处，不再对照。核对结果不存在时不检查（还没跑 `/factcheck`）。
    """
    path = context.episode.factcheck
    if not path.is_file():
        return []
    try:
        report = load_factcheck(path)
    except FactcheckError as error:
        return [
            Finding(Level.ERROR, WHOLE_SCRIPT, f"`{FACTCHECK_NAME}` 格式不对：{error}")
        ]
    judged = {checked.id: checked for checked in report.lines}
    lines = {line.id for line in context.script.lines}
    findings = []
    for line in context.script.lines:
        checked = judged.get(line.id)
        if checked is None:
            findings.append(
                Finding(Level.ERROR, line.id, f"`{FACTCHECK_NAME}` 里没有这一句的判定")
            )
        elif (checked.text, checked.cite, checked.speech) != (
            line.text,
            line.cite,
            line.speech,
        ):
            findings.append(
                Finding(
                    Level.ERROR,
                    line.id,
                    f"字幕、朗读或出处和 `{FACTCHECK_NAME}` 里核对过的不同，"
                    "核对之后改过这一句",
                )
            )
    findings += [
        Finding(
            Level.ERROR,
            checked.id,
            f"`{FACTCHECK_NAME}` 里有这一句的判定，但旁白稿里没有这一句",
        )
        for checked in judged.values()
        if checked.id not in lines
    ]
    return findings


RULES: list[Rule] = [
    cite_exists,
    cite_has_text,
    estimated_duration,
    minutes_follow_script,
    title_is_topic,
    segments_follow_outline,
    points_covered,
    points_cited,
    no_tip_numbers,
    cite_in_scope,
    not_copied,
    description_terms,
]


def check_script(path: Path) -> Report:
    """`pixelbook check`：期目录里的旁白稿，`RULES` 加上对照核对结果（`factcheck_matches`）。

    期目录布局不对、转换结果不存在时抛出异常，不出报告。
    """
    return _check(path, EpisodePath.from_script(path), [*RULES, factcheck_matches])


def check_unjudged(path: Path, episode: EpisodePath | None = None) -> Report:
    """只跑 `RULES`，不对照 `factcheck.yaml`：还没核对过的稿。

    - 草稿副本（`pixelbook check <副本> --episode`，比如给用户的建议改法）：`path` 在期目录外，
      按 `episode` 这一期的大纲和原文检查；改过的句子本来就和核对结果对不上。
    - 给裁判出题前（`factcheck-prompt`）：旧的核对结果和改过的稿对不上是预期的。
    """
    return _check(path, episode or EpisodePath.from_script(path), RULES)


def _check(path: Path, episode: EpisodePath, rules: list[Rule]) -> Report:
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
        return Report([Finding(Level.ERROR, WHOLE_SCRIPT, message)], [])
    outline, problem = outline_episode(episode)
    findings = [Finding(Level.ERROR, WHOLE_SCRIPT, problem)] if problem else []
    context = Context(
        path, episode, script, read_chapter(converted), converted.name, outline
    )
    findings += [finding for rule in rules for finding in rule(context)]
    return Report(
        errors=[f for f in findings if f.level == Level.ERROR],
        warnings=[f for f in findings if f.level == Level.WARNING],
        timing=estimate(script, outline),
    )


def outline_episode(episode: EpisodePath) -> tuple[Episode | None, str | None]:
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


def format_report(path: Path, report: Report) -> str:
    """估算时长（全稿和每一段），然后报错和警告分成两块，每条以旁白句 ID 开头。"""
    blocks = [
        *_timing(report.timing),
        _block(Level.ERROR, report.errors),
        _block(Level.WARNING, report.warnings),
        f"{path}: 旁白稿检查{'通过' if report.passed else '没有通过'}",
    ]
    return "\n".join(blocks)


def _timing(timing: Timing | None) -> list[str]:
    if timing is None:
        return []
    low, high = SECONDS
    rows = [
        (
            f"估算时长：{clock(timing.seconds)}（{timing.chars} 字，"
            f"按 {CHARS_PER_MINUTE} 字/分钟，应该在 {clock(low)}–{clock(high)} 内）"
        )
    ]
    for segment in timing.segments:
        plan = (
            f"大纲 {clock(segment.planned)}（{segment.minutes:g} 分钟）"
            if segment.planned is not None
            else "大纲：段对不上，不对照"
        )
        rows.append(
            f"  {segment.id} {segment.title}：{segment.chars} 字，"
            f"估算 {clock(segment.seconds)}，{plan}"
        )
    return rows


def _block(title: str, findings: list[Finding]) -> str:
    if not findings:
        return f"{title}：无"
    listed = "\n".join(f"  {f.where}：{f.message}" for f in findings)
    return f"{title}（{len(findings)} 条）：\n{listed}"
