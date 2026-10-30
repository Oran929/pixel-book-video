"""大纲 `books/<书>/chNN/outline.yaml` 的读取与检查（格式见 `docs/reference/outline.md`「大纲」）。

结构：章号 `chapter` → 期（`id`、`topic`、`units`、`segments`、`points`）。
`units` 的每项是单元号，或带段落编号范围的 `{unit, from, to}`（长单元拆成两期时用）；
`segments` 的每项是段的 `title` 和预计分钟数 `minutes`；`points` 的每项是核心观点的
`id`、`text` 和出处 `cite`（写法和旁白稿相同）。

格式不对时报错，指出是哪一期、哪个字段；格式对了再检查唯一性、段数、时长和出处，
这些问题一次全部列出。
"""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from pixelbook.convert import PARAGRAPH_ID, Chapter, parse_cite, read_chapter
from pixelbook.copied import copied, copied_message
from pixelbook.episode_path import ChapterPath

# 期 ID：`ep01` 起，两位数补零
EPISODE_ID = re.compile(r"^ep\d{2}$")
# 每期的段数和预计总时长（含两端）
SEGMENTS = (4, 6)
SECONDS = (4 * 60, 6 * 60)
# 书的提示编号：「提示14」「提示 14」「提示１４」「提示十四」。对观众没有意义，大纲的主题、段标题、
# 观点和旁白稿的字幕、朗读、标题都不写（画面说明可以写，用来指明是哪个提示框）。中文数字后面
# 紧跟量词或「下」「定」时不算（「提示一下」「这条提示一定要记住」）
TIP_NUMBER = re.compile(
    r"提示\s*(?:[0-9０-９]+|[零〇一二三四五六七八九十百]+(?![零〇一二三四五六七八九十百下定个些次条点种句遍声番位]))"
)


@dataclass(frozen=True)
class UnitRange:
    """一期覆盖的一个单元；`start`、`end` 都有时只覆盖这段范围（含两端）。"""

    unit: int
    start: str | None = None
    end: str | None = None


@dataclass(frozen=True)
class Segment:
    title: str
    minutes: float


@dataclass(frozen=True)
class Point:
    """一条核心观点。"""

    id: str
    text: str
    cite: list[str]


@dataclass(frozen=True)
class Episode:
    id: str
    topic: str
    units: list[UnitRange]
    segments: list[Segment]
    points: list[Point]


@dataclass(frozen=True)
class Outline:
    chapter: int
    episodes: list[Episode]


class OutlineError(Exception):
    pass


def load_outline(path: Path) -> Outline:
    """只读格式，不看转换结果；格式不对时报第一处错。"""

    def fail(where: str, field: str, problem: str) -> OutlineError:
        return OutlineError(f"{path}: {where}：`{field}` {problem}")

    def mapping(data: Any, where: str, required: list[str], optional=()) -> dict:
        if not isinstance(data, dict):
            raise OutlineError(f"{path}: {where}：应该是一个映射（键: 值）")
        for key in data:
            if key not in (*required, *optional):
                raise fail(where, key, "不是认识的字段")
        for key in required:
            if key not in data:
                raise fail(where, key, "缺失")
        return data

    def string(data: dict, key: str, where: str) -> str:
        value = data[key]
        if not isinstance(value, str) or not value.strip():
            raise fail(where, key, "必须是非空的文本")
        return value

    def integer(data: dict, key: str, where: str) -> int:
        value = data[key]
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            raise fail(where, key, "必须是正整数")
        return value

    def items(data: dict, key: str, where: str) -> list:
        value = data[key]
        if not isinstance(value, list) or not value:
            raise fail(where, key, "必须是非空的列表")
        return value

    def unit(data: Any, where: str) -> UnitRange:
        if not isinstance(data, dict):
            return UnitRange(integer({"units": data}, "units", where))
        data = mapping(data, where, ["unit", "from", "to"])
        for key in ("from", "to"):
            if not (isinstance(data[key], str) and PARAGRAPH_ID.match(data[key])):
                raise fail(where, key, "必须是一个段落编号，如 `ch02-¶034`")
        return UnitRange(integer(data, "unit", where), data["from"], data["to"])

    def segment(data: Any, where: str) -> Segment:
        data = mapping(data, where, ["title", "minutes"])
        minutes = data["minutes"]
        if (
            not isinstance(minutes, int | float)
            or isinstance(minutes, bool)
            or minutes <= 0
        ):
            raise fail(where, "minutes", "必须是正数（分钟）")
        return Segment(string(data, "title", where), minutes)

    def point(data: Any, where: str) -> Point:
        data = mapping(data, where, ["id", "text", "cite"])
        point_id = string(data, "id", where)
        where = f"{where}（{point_id}）"
        if (cite := parse_cite(data["cite"])) is None:
            raise fail(
                where,
                "cite",
                "必须是一个段落编号（如 `ch02-¶034`）或编号列表，不支持范围",
            )
        return Point(point_id, string(data, "text", where), cite)

    def episode(data: Any, where: str) -> Episode:
        if isinstance(data, dict) and isinstance(data.get("id"), str):
            where = f"{where}（{data['id']}）"
        data = mapping(data, where, ["id", "topic", "units", "segments", "points"])
        episode_id = string(data, "id", where)
        if not EPISODE_ID.match(episode_id):
            raise fail(where, "id", "必须形如 `ep01`")
        return Episode(
            id=episode_id,
            topic=string(data, "topic", where),
            units=[
                unit(item, f"{where}第 {n} 个单元")
                for n, item in enumerate(items(data, "units", where), start=1)
            ],
            segments=[
                segment(item, f"{where}第 {n} 段")
                for n, item in enumerate(items(data, "segments", where), start=1)
            ],
            points=[
                point(item, f"{where}第 {n} 条观点")
                for n, item in enumerate(items(data, "points", where), start=1)
            ],
        )

    data = mapping(yaml.safe_load(path.read_text()), "大纲", ["chapter", "episodes"])
    return Outline(
        chapter=integer(data, "chapter", "大纲"),
        episodes=[
            episode(item, f"第 {n} 期")
            for n, item in enumerate(items(data, "episodes", "大纲"), start=1)
        ],
    )


def check_outline(path: Path) -> tuple[Outline, list[str]]:
    """读大纲并对照该章的转换结果检查，返回大纲和警告；有报错时抛出异常，列出全部报错和警告。

    警告（疑似照搬原文）不影响通过：术语、专有名词、提示框标题有时只能照用，由人判断。
    """
    chapter_path = ChapterPath.from_outline(path)
    outline = load_outline(path)
    if not chapter_path.converted.is_file():
        raise OutlineError(
            f"{path}: 转换结果 {chapter_path.converted} 不存在，"
            "先跑 `pixelbook convert <书目录>`"
        )
    problems = []
    warnings = []
    if outline.chapter != chapter_path.number:
        problems.append(
            f"大纲：`chapter` 是 {outline.chapter}，"
            f"但大纲在章目录 {chapter_path.dir.name} 里"
        )
    chapter = read_chapter(chapter_path.converted)
    source = chapter_path.converted.name
    episodes: dict[str, str] = {}
    points: dict[str, str] = {}
    for n, episode in enumerate(outline.episodes, start=1):
        where = f"第 {n} 期（{episode.id}）"
        if episode.id in episodes:
            problems.append(f"{where}：`id` 和{episodes[episode.id]}重复")
        episodes.setdefault(episode.id, where)
        problems += _check_segments(episode, where)
        problems += _check_tip_numbers(episode, where)
        problems += _check_units(episode, where, chapter, source)
        scope = episode_scope(episode, chapter)
        for m, point in enumerate(episode.points, start=1):
            label = f"{where}第 {m} 条观点（{point.id}）：`cite`"
            if missing := [i for i in point.cite if i not in chapter.paragraphs]:
                problems.append(
                    f"{label} 里的 {'、'.join(missing)} 在 {source} 里不存在"
                )
            elif all(chapter.paragraphs[i].is_image for i in point.cite):
                problems.append(f"{label} 只引用了图片段，至少要有一个文字段")
            if outside := outside_scope(point.cite, scope, chapter):
                problems.append(
                    f"{label} 里的 {'、'.join(outside)} 不在本期覆盖的单元或段落范围里"
                )
            warnings += [
                f"{where}第 {m} 条观点（{point.id}）：{copied_message(cited, piece)}"
                for cited in point.cite
                if cited in chapter.paragraphs
                and (piece := copied(point.text, chapter.paragraphs[cited]))
            ]
            if point.id in points:
                problems.append(
                    f"{where}：`points` 里的观点 ID {point.id} 和{points[point.id]}重复"
                )
            points.setdefault(point.id, where)
    problems += _check_coverage(outline, chapter)
    if problems:
        listed = "\n".join(f"  {problem}" for problem in problems)
        raise OutlineError(
            f"{path}: 大纲检查没有通过（{len(problems)} 处）：\n{listed}"
            + (f"\n{format_warnings(warnings)}" if warnings else "")
        )
    return outline, warnings


def tip_numbers(text: str) -> list[str]:
    """`text` 里书的提示编号（`TIP_NUMBER`），按出现顺序。"""
    return [match.group() for match in TIP_NUMBER.finditer(text)]


def tip_number_message(where: str, number: str) -> str:
    return f"{where} 里有书里的提示编号「{number}」，编号对观众没有意义，不念也不显示"


def _check_tip_numbers(episode: Episode, where: str) -> list[str]:
    fields = [(f"{where}：`topic`", episode.topic)]
    fields += [
        (f"{where}第 {n} 段：`title`", segment.title)
        for n, segment in enumerate(episode.segments, start=1)
    ]
    fields += [
        (f"{where}第 {n} 条观点（{point.id}）：`text`", point.text)
        for n, point in enumerate(episode.points, start=1)
    ]
    return [
        tip_number_message(label, number)
        for label, text in fields
        for number in tip_numbers(text)
    ]


def format_warnings(warnings: list[str]) -> str:
    listed = "\n".join(f"  {warning}" for warning in warnings)
    return f"警告（{len(warnings)} 条）：\n{listed}"


def _check_segments(episode: Episode, where: str) -> list[str]:
    problems = []
    titles = [segment.title for segment in episode.segments]
    if repeated := sorted({t for t in titles if titles.count(t) > 1}):
        problems.append(f"{where}：`segments` 里的段标题重复：{'、'.join(repeated)}")
    low, high = SEGMENTS
    if not low <= len(titles) <= high:
        problems.append(
            f"{where}：`segments` 有 {len(titles)} 段，每期应该有 {low}–{high} 段"
        )
    seconds = round(sum(segment.minutes for segment in episode.segments) * 60)
    low, high = SECONDS
    if not low <= seconds <= high:
        problems.append(
            f"{where}：各段 `minutes` 的总和是 {clock(seconds)}，"
            f"应该在 {clock(low)}–{clock(high)} 内"
        )
    return problems


def _check_units(
    episode: Episode, where: str, chapter: Chapter, source: str
) -> list[str]:
    problems = []
    for covered in episode.units:
        unit = chapter.units.get(covered.unit)
        if unit is None:
            problems.append(
                f"{where}：`units` 里的单元 {covered.unit} 在 {source} 里没有"
            )
            continue
        if covered.start is None:
            continue
        label = f"{where}：`units` 里单元 {covered.unit} 的范围"
        outside = [i for i in (covered.start, covered.end) if i not in unit.paragraphs]
        if outside:
            problems.append(
                f"{label} {covered.start}–{covered.end}：{'、'.join(outside)} "
                f"不在单元 {covered.unit}{_span(unit.paragraphs)}里"
            )
        elif unit.paragraphs.index(covered.start) > unit.paragraphs.index(covered.end):
            problems.append(
                f"{label} {covered.start}–{covered.end}：`from` 应该在 `to` 前面"
            )
    return problems


def covered_paragraphs(covered: UnitRange, chapter: Chapter) -> list[str] | None:
    """`units` 里一项覆盖的段落编号，按原文顺序；单元不存在或范围不对时为 None。"""
    unit = chapter.units.get(covered.unit)
    if unit is None:
        return None
    paragraphs = unit.paragraphs
    if covered.start is None:
        return paragraphs
    if covered.start not in paragraphs or covered.end not in paragraphs:
        return None
    start, end = paragraphs.index(covered.start), paragraphs.index(covered.end)
    return paragraphs[start : end + 1] if start <= end else None


def episode_scope(episode: Episode, chapter: Chapter) -> set[str]:
    """本期覆盖的段落编号。单元不存在、范围不对的项跳过（由 `_check_units` 报）。"""
    return {
        paragraph
        for covered in episode.units
        for paragraph in covered_paragraphs(covered, chapter) or []
    }


def outside_scope(cite: list[str], scope: set[str], chapter: Chapter) -> list[str]:
    """出处里不在本期范围 `scope` 里的编号。章末脚注看它的标记所在的段落；
    不存在的编号不算（另外报）。"""
    paragraphs = chapter.paragraphs
    return [
        i
        for i in cite
        if i in paragraphs and (paragraphs[i].marked_in or i) not in scope
    ]


def _check_coverage(outline: Outline, chapter: Chapter) -> list[str]:
    """每个单元的每个编号段落恰好属于一期，各期按原文顺序排列。

    章首导语和章末脚注不属于任何单元，不要求覆盖。`units` 本身有问题（单元不存在、
    范围不对）时由 `_check_units` 报，这里不再检查，免得同一处问题报两遍。
    """
    owners: dict[str, list[str]] = {}
    order = []
    for episode in outline.episodes:
        for covered in episode.units:
            paragraphs = covered_paragraphs(covered, chapter)
            if paragraphs is None:
                return []
            for paragraph in paragraphs:
                owners.setdefault(paragraph, []).append(episode.id)
            order += paragraphs
    problems = []
    for unit in chapter.units.values():
        for run, ids in _runs(unit.paragraphs, lambda p: tuple(owners.get(p, ()))):
            if not ids:
                problems.append(f"大纲：单元 {unit.number} 的 {run} 不属于任何一期")
            elif len(ids) > 1:
                problems.append(
                    f"大纲：单元 {unit.number} 的 {run} 同时属于 {' 和 '.join(ids)}"
                )
    expected = [p for unit in chapter.units.values() for p in unit.paragraphs]
    if not problems and order != expected:
        problems.append("大纲：各期（和每期 `units` 里各项）没有按原文顺序排列")
    return problems


def _runs(paragraphs: list[str], key) -> list[tuple[str, Any]]:
    """把连续的、`key` 相同的段落合成一段范围：(「首–尾」或单个编号, key)。"""
    runs: list[tuple[list[str], Any]] = []
    for paragraph in paragraphs:
        value = key(paragraph)
        if runs and runs[-1][1] == value:
            runs[-1][0].append(paragraph)
        else:
            runs.append(([paragraph], value))
    return [
        (ids[0] if len(ids) == 1 else f"{ids[0]}–{ids[-1]}", value)
        for ids, value in runs
    ]


def _span(paragraphs: list[str]) -> str:
    return f"（{paragraphs[0]}–{paragraphs[-1]}）" if paragraphs else "（没有段落）"


def unit_table(converted: Path) -> str:
    """写大纲前看的单元表（`pixelbook units`）：每个单元一行，写出单元号和名字、首尾段落编号、
    段数、正文字数（不算图片段，用来估一期装得下多少，见 `/outline` 的拆期规则），下面按原文
    顺序列出单元里的提示框标题和 `####` 小标题（相邻两段共用的只列一次）。"""
    if not converted.is_file():
        raise OutlineError(
            f"转换结果 {converted} 不存在，先跑 `pixelbook convert <书目录>`"
        )
    chapter = read_chapter(converted)
    rows = []
    for unit in chapter.units.values():
        paragraphs = [chapter.paragraphs[i] for i in unit.paragraphs]
        chars = sum(len(p.text) for p in paragraphs if not p.is_image)
        rows.append(
            f"单元 {unit.number}　{unit.name}{_span(unit.paragraphs)}："
            f"{len(paragraphs)} 段，正文 {chars} 字"
        )
        headings: list[str] = []
        for p in paragraphs:
            for row in (
                f"  提示框：{p.tip_before}" if p.tip_before else None,
                f"  小标题：{p.heading_before}" if p.heading_before else None,
                f"  提示框：{p.tip_after}" if p.tip_after else None,
                f"  小标题：{p.heading_after}" if p.heading_after else None,
            ):
                if row and row not in headings[-1:]:
                    headings.append(row)
        rows += headings
    return "\n".join(rows)


def clock(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"
