"""旁白稿（YAML）的读取与校验。只有 Python 读旁白稿（ADR-0004）。

结构：期（`title`：这一期的书名或主题名，显示在画面左上角）→ 段（`id`、`title`）→ 画面（`id`、`description`）→ 旁白句
（`id`、`text`、可选的 `speech`、`cite`）。格式不对时报错，指出是哪一句、哪个字段。
"""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

# 字幕文本去掉所有空白后的最大字符数；汉字、字母、数字、标点各算 1 个
MAX_TEXT_CHARS = 20


@dataclass(frozen=True)
class Line:
    id: str
    text: str
    cite: str
    speech: str | None = None


@dataclass(frozen=True)
class Scene:
    id: str
    description: str
    lines: list[Line]


@dataclass(frozen=True)
class Segment:
    id: str
    title: str
    scenes: list[Scene]


@dataclass(frozen=True)
class Script:
    title: str
    segments: list[Segment]


class ScriptError(Exception):
    pass


def text_length(text: str) -> int:
    return len(re.sub(r"\s", "", text))


def load_script(path: Path) -> Script:
    seen: dict[str, str] = {}

    def fail(where: str, field: str, problem: str) -> ScriptError:
        return ScriptError(f"{path}: {where}：`{field}` {problem}")

    def mapping(data: Any, where: str, required: list[str], optional=()) -> dict:
        if not isinstance(data, dict):
            raise ScriptError(f"{path}: {where}：应该是一个映射（键: 值）")
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

    def items(data: dict, key: str, where: str) -> list:
        value = data[key]
        if not isinstance(value, list) or not value:
            raise fail(where, key, "必须是非空的列表")
        return value

    def labelled(data: Any, where: str) -> tuple[str, str]:
        """检查 ID 是否存在且不重复，返回 ID 和带 ID 的位置描述。"""
        if not isinstance(data, dict):
            raise ScriptError(f"{path}: {where}：应该是一个映射（键: 值）")
        if "id" not in data:
            raise fail(where, "id", "缺失")
        value = string(data, "id", where)
        where = f"{where}（{value}）"
        if value in seen:
            raise fail(where, "id", f"和{seen[value]}重复")
        seen[value] = where
        return value, where

    def line(data: Any, where: str) -> Line:
        line_id, where = labelled(data, where)
        data = mapping(data, where, ["id", "text", "cite"], ["speech"])
        text = string(data, "text", where)
        if (length := text_length(text)) > MAX_TEXT_CHARS:
            raise fail(
                where,
                "text",
                f"超过 {MAX_TEXT_CHARS} 个字符（去掉空白后实际 {length} 个）：{text}",
            )
        return Line(
            id=line_id,
            text=text,
            cite=string(data, "cite", where),
            speech=string(data, "speech", where) if "speech" in data else None,
        )

    def scene(data: Any, where: str) -> Scene:
        scene_id, label = labelled(data, where)
        data = mapping(data, label, ["id", "description", "lines"])
        return Scene(
            id=scene_id,
            description=string(data, "description", label),
            lines=[
                line(item, f"{where}第 {n} 句")
                for n, item in enumerate(items(data, "lines", label), start=1)
            ],
        )

    def segment(data: Any, where: str) -> Segment:
        segment_id, label = labelled(data, where)
        data = mapping(data, label, ["id", "title", "scenes"])
        return Segment(
            id=segment_id,
            title=string(data, "title", label),
            scenes=[
                scene(item, f"{where}第 {n} 个画面")
                for n, item in enumerate(items(data, "scenes", label), start=1)
            ],
        )

    data = mapping(yaml.safe_load(path.read_text()), "旁白稿", ["title", "segments"])
    return Script(
        title=string(data, "title", "旁白稿"),
        segments=[
            segment(item, f"第 {n} 段")
            for n, item in enumerate(items(data, "segments", "旁白稿"), start=1)
        ],
    )
