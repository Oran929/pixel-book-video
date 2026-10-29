"""大纲 `books/<书>/chNN/outline.yaml` 的读取与检查（格式见 README「大纲」）。

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
from pixelbook.episode_path import ChapterPath

# 期 ID：`ep01` 起，两位数补零
EPISODE_ID = re.compile(r"^ep\d{2}$")
# 每期的段数和预计总时长（含两端）
SEGMENTS = (4, 6)
SECONDS = (4 * 60, 6 * 60)


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


def check_outline(path: Path) -> Outline:
    """读大纲并对照该章的转换结果检查；有问题时报错，列出全部问题。"""
    chapter_path = ChapterPath.from_outline(path)
    outline = load_outline(path)
    if not chapter_path.converted.is_file():
        raise OutlineError(
            f"{path}: 转换结果 {chapter_path.converted} 不存在，"
            "先跑 `pixelbook convert <书目录>`"
        )
    problems = []
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
        problems += _check_units(episode, where, chapter, source)
        for m, point in enumerate(episode.points, start=1):
            if missing := [i for i in point.cite if i not in chapter.paragraphs]:
                problems.append(
                    f"{where}第 {m} 条观点（{point.id}）：`cite` 里的"
                    f" {'、'.join(missing)} 在 {source} 里不存在"
                )
            if point.id in points:
                problems.append(
                    f"{where}：`points` 里的观点 ID {point.id} 和{points[point.id]}重复"
                )
            points.setdefault(point.id, where)
    if problems:
        listed = "\n".join(f"  {problem}" for problem in problems)
        raise OutlineError(
            f"{path}: 大纲检查没有通过（{len(problems)} 处）：\n{listed}"
        )
    return outline


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
            f"{where}：各段 `minutes` 的总和是 {_clock(seconds)}，"
            f"应该在 {_clock(low)}–{_clock(high)} 内"
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


def _span(paragraphs: list[str]) -> str:
    return f"（{paragraphs[0]}–{paragraphs[-1]}）" if paragraphs else "（没有段落）"


def _clock(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"
