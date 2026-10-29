"""语义核对结果 `factcheck.yaml` 的读取（格式见 README「语义核对」，ADR-0008）。

由 `pixelbook factcheck-record` 写出：第几轮核对 `round`，以及每个旁白句一条判定（`id`、
核对时的字幕 `text` 和出处 `cite`、`verdict`、`reason`）。`text`、`cite` 用来发现
核对之后又改过的句子。裁判 subagent 的回答是同样的 `lines`，只是没有 `text`、`cite`，
另外在顶层抄回 prompt 的校验码 `packet`，用 `load_answer` 读。这里只读格式，不比较旁白稿；对照旁白稿的检查在 `check` 和 `judge` 里。
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from pixelbook.convert import parse_cite

SUPPORTED = "supported"
PARTIAL = "partial"
UNSUPPORTED = "unsupported"
VERDICTS = (SUPPORTED, PARTIAL, UNSUPPORTED)

ANSWER_FIELDS = ["id", "verdict", "reason"]
RECORDED_FIELDS = ["id", "text", "cite", "verdict", "reason"]


@dataclass(frozen=True)
class Verdict:
    """一个旁白句的判定和一句理由；记进 `factcheck.yaml` 的还有核对时的字幕和出处。"""

    id: str
    verdict: str
    reason: str
    text: str = ""
    cite: list[str] | None = None


@dataclass(frozen=True)
class Factcheck:
    round: int
    lines: list[Verdict]


class FactcheckError(Exception):
    pass


def load_factcheck(path: Path) -> Factcheck:
    """格式不对时报第一处错，指出是第几条、哪个字段。"""
    data = _mapping(_yaml(path), "核对结果", ["round", "lines"])
    round_ = data["round"]
    if isinstance(round_, bool) or not isinstance(round_, int) or round_ < 1:
        raise _fail("核对结果", "round", "必须是正整数（第几轮核对，从 1 起）")
    return Factcheck(round_, _lines(data, RECORDED_FIELDS))


def load_answer(path: Path) -> tuple[str, list[Verdict]]:
    """裁判的回答：校验码 `packet`，和 `lines`（每条只有 `id`、`verdict`、`reason`）。"""
    data = _mapping(_yaml(path), "裁判的回答", ["packet", "lines"])
    token = data["packet"]
    if not isinstance(token, str) or not token.strip():
        raise _fail("裁判的回答", "packet", "必须是 prompt 最后一行的校验码")
    return token.strip(), _lines(data, ANSWER_FIELDS)


def _lines(data: dict, fields: list[str]) -> list[Verdict]:
    lines = data["lines"]
    if not isinstance(lines, list) or not lines:
        raise _fail("核对结果", "lines", "必须是非空的列表")
    seen: set[str] = set()
    verdicts = []
    for n, item in enumerate(lines, start=1):
        where = f"第 {n} 条"
        item = _mapping(item, where, fields)
        line_id = _string(item, "id", where)
        where = f"{where}（{line_id}）"
        if line_id in seen:
            raise _fail(where, "id", "重复，每句只能有一条判定")
        seen.add(line_id)
        text, cite = "", None
        if "text" in fields:
            text = _string(item, "text", where)
            if (cite := parse_cite(item["cite"])) is None:
                raise _fail(where, "cite", "必须是一个段落编号或编号列表，不支持范围")
        if item["verdict"] not in VERDICTS:
            raise _fail(where, "verdict", f"必须是 {' / '.join(VERDICTS)} 之一")
        reason = _string(item, "reason", where)
        verdicts.append(Verdict(line_id, item["verdict"], reason, text, cite))
    return verdicts


def _yaml(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text())
    except yaml.YAMLError as error:
        raise FactcheckError(f"不是合法的 YAML：{error}") from error


def _fail(where: str, field: str, problem: str) -> FactcheckError:
    return FactcheckError(f"{where}：`{field}` {problem}")


def _mapping(data: Any, where: str, fields: list[str]) -> dict:
    if not isinstance(data, dict):
        raise FactcheckError(f"{where}：应该是一个映射（键: 值）")
    for key in data:
        if key not in fields:
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
