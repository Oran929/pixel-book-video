"""语义核对结果 `factcheck.yaml` 的读写（格式见 README「语义核对」，ADR-0008）。

由 `pixelbook factcheck-record` 写出（`write_factcheck`）：第几轮核对 `round`，以及每个旁白句
一条记录 `CheckedLine`：核对时的字幕 `text`、出处 `cite`（旁白句有 `speech` 时还有它），和裁判的
`verdict`、`reason`。`text`、`cite`、`speech` 用来发现核对之后又改过的句子。

裁判 subagent 的回答 `Answer` 是另一种格式：每句只有 `id`、`verdict`、`reason`（`Judgement`），
另外在顶层抄回 prompt 的校验码 `packet`，用 `load_answer` 读。这里只管格式，不比较旁白稿；
对照旁白稿的检查在 `check` 和 `judge` 里。
"""

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any

import yaml

from pixelbook.convert import parse_cite


class Verdict(StrEnum):
    """一句的判定：原文支持、部分支持、不支持。"""

    SUPPORTED = "supported"
    PARTIAL = "partial"
    UNSUPPORTED = "unsupported"


@dataclass(frozen=True)
class Judgement:
    """裁判对一个旁白句的判定和一句理由。"""

    id: str
    verdict: Verdict
    reason: str


@dataclass(frozen=True)
class Answer:
    """裁判的回答：抄回的校验码和逐句的判定。"""

    packet: str
    lines: list[Judgement]


@dataclass(frozen=True)
class CheckedLine:
    """`factcheck.yaml` 里的一条：核对时的旁白句（字幕、出处、`speech`）和裁判的判定。"""

    id: str
    text: str
    cite: list[str]
    verdict: Verdict
    reason: str
    speech: str | None = None


@dataclass(frozen=True)
class Factcheck:
    round: int
    lines: list[CheckedLine]


class FactcheckError(Exception):
    pass


def load_factcheck(path: Path) -> Factcheck:
    """格式不对时报第一处错，指出是第几条、哪个字段。"""
    data = _mapping(_yaml(path), "核对结果", ["round", "lines"])
    round_ = data["round"]
    if isinstance(round_, bool) or not isinstance(round_, int) or round_ < 1:
        raise _fail("核对结果", "round", "必须是正整数（第几轮核对，从 1 起）")
    lines = []
    fields = ["id", "text", "cite", "verdict", "reason"]
    for where, item in _items(data, fields, ["speech"]):
        if (cite := parse_cite(item["cite"])) is None:
            raise _fail(where, "cite", "必须是一个段落编号或编号列表，不支持范围")
        lines.append(
            CheckedLine(
                id=item["id"],
                text=_string(item, "text", where),
                cite=cite,
                verdict=_verdict(item, where),
                reason=_string(item, "reason", where),
                speech=_string(item, "speech", where) if "speech" in item else None,
            )
        )
    return Factcheck(round_, lines)


def write_factcheck(path: Path, factcheck: Factcheck) -> None:
    """写出 `load_factcheck` 读的格式；没有 `speech` 的句子不写这个字段。"""
    data = {
        "round": factcheck.round,
        "lines": [
            {
                "id": line.id,
                "text": line.text,
                "cite": line.cite,
                **({"speech": line.speech} if line.speech else {}),
                "verdict": line.verdict.value,
                "reason": line.reason,
            }
            for line in factcheck.lines
        ],
    }
    path.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000)
    )


def load_answer(path: Path) -> Answer:
    """裁判的回答：校验码 `packet`，和 `lines`（每条只有 `id`、`verdict`、`reason`）。"""
    data = _mapping(_yaml(path), "裁判的回答", ["packet", "lines"])
    token = data["packet"]
    if not isinstance(token, str) or not token.strip():
        raise _fail("裁判的回答", "packet", "必须是 prompt 最后一行的校验码")
    lines = []
    for where, item in _items(data, ["id", "verdict", "reason"]):
        lines.append(
            Judgement(item["id"], _verdict(item, where), _string(item, "reason", where))
        )
    return Answer(token.strip(), lines)


def _items(data: dict, fields: list[str], optional=()) -> list[tuple[str, dict]]:
    """`lines` 的每一项和它的位置描述（`第 n 条（ID）`）：先查字段，再查 ID 不重复。"""
    lines = data["lines"]
    if not isinstance(lines, list) or not lines:
        raise _fail("核对结果", "lines", "必须是非空的列表")
    seen: set[str] = set()
    items = []
    for n, item in enumerate(lines, start=1):
        where = f"第 {n} 条"
        item = _mapping(item, where, fields, optional)
        line_id = _string(item, "id", where)
        where = f"{where}（{line_id}）"
        if line_id in seen:
            raise _fail(where, "id", "重复，每句只能有一条判定")
        seen.add(line_id)
        items.append((where, item))
    return items


def _verdict(item: dict, where: str) -> Verdict:
    if item["verdict"] not in set(Verdict):
        raise _fail(where, "verdict", f"必须是 {' / '.join(Verdict)} 之一")
    return Verdict(item["verdict"])


def _yaml(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text())
    except yaml.YAMLError as error:
        raise FactcheckError(f"不是合法的 YAML：{error}") from error


def _fail(where: str, field: str, problem: str) -> FactcheckError:
    return FactcheckError(f"{where}：`{field}` {problem}")


def _mapping(data: Any, where: str, fields: list[str], optional=()) -> dict:
    if not isinstance(data, dict):
        raise FactcheckError(f"{where}：应该是一个映射（键: 值）")
    for key in data:
        if key not in (*fields, *optional):
            raise _fail(where, key, "不是认识的字段")
    for key in fields:
        if key not in data:
            raise _fail(where, key, "缺失")
    return data


def _string(data: dict, key: str, where: str) -> str:
    value = data[key]
    if not isinstance(value, str) or not value.strip():
        raise _fail(where, key, "必须是非空的文本")
    return value
