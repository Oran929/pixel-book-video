"""读音表：全频道共用的"术语 → 朗读写法"对照表（仓库根目录 `pronunciation.yaml`）。

生成朗读文本时按读音表机械替换；旁白句手写了 `speech` 时以手写的为准。
"""

import re
from pathlib import Path

import yaml

from pixelbook.script import Line, Script

# 片段两端不算进片段的半角句读标点
_EDGE_PUNCTUATION = ",.!?:;\"'()"
_PUNCT = re.escape(_EDGE_PUNCTUATION)
# 除句读标点以外的 ASCII 可见字符：挨着它们说明还在同一个片段里
_INNER = rf"(?![{_PUNCT}])[!-~]"


class PronunciationError(Exception):
    pass


def load_pronunciation(path: Path) -> dict[str, str]:
    """读取读音表。键和值都必须是非空文本；`DRY: DRY` 这种原样不变的条目表示已确认。"""
    data = yaml.safe_load(path.read_text())
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise PronunciationError(f"{path}: 应该是一个映射（术语: 朗读写法）")
    for term, reading in data.items():
        if not isinstance(term, str) or not term.strip():
            raise PronunciationError(
                f"{path}: `{term}` 不是文本；YAML 会把 yes、no、数字等读成别的类型，"
                "这类术语要加引号"
            )
        if not isinstance(reading, str) or not reading.strip():
            raise PronunciationError(f"{path}: `{term}` 的朗读写法必须是非空的文本")
    return data


def _term_pattern(table: dict[str, str]) -> re.Pattern[str] | None:
    """匹配读音表里任意一个键：最长的键优先，区分大小写。

    键不匹配更长片段的一部分（`AI` 不匹配 `OpenAI`，`C` 不匹配 `C++`，
    `Node` 不匹配 `Node.js`），这样更长的片段会整个报成新术语；
    键旁边是片段两端的句读标点时照常匹配（`DRY.`、`(DRY)`）。
    """
    if not table:
        return None
    keys = sorted(table, key=lambda key: (-len(key), key))
    before = rf"(?<!{_INNER})(?<![A-Za-z0-9][{_PUNCT}])"
    after = rf"(?!{_INNER})(?![{_PUNCT}][A-Za-z0-9])"
    return re.compile("|".join(before + re.escape(key) + after for key in keys))


def apply_pronunciation(text: str, table: dict[str, str]) -> str:
    pattern = _term_pattern(table)
    if pattern is None:
        return text
    return pattern.sub(lambda match: table[match.group()], text)


# 片段：连续的 ASCII 可见字符；单词之间的单个半角空格算在同一个片段里
_SEGMENT = re.compile(r"[!-~]+(?: [!-~]+)*")
# 纯数字：整数（可带千分位逗号）、可选小数、可选百分号
_NUMBER = re.compile(r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?")


def new_terms(text: str, table: dict[str, str]) -> list[str]:
    """字幕文本里读音表没有覆盖的片段（纯数字除外），按出现顺序、不重复。

    先把读音表的键从文本里扣掉（最长优先，区分大小写），剩下的才判断。
    """
    pattern = _term_pattern(table)
    if pattern is not None:
        # 换成换行而不是删掉，免得键两边的片段连成一个
        text = pattern.sub("\n", text)
    terms: list[str] = []
    for match in _SEGMENT.finditer(text):
        term = match.group().strip(_EDGE_PUNCTUATION)
        if term and not _NUMBER.fullmatch(term) and term not in terms:
            terms.append(term)
    return terms


def find_new_terms(script: Script, table: dict[str, str]) -> dict[str, list[str]]:
    """一期旁白稿的新术语清单：术语 → 出现在哪些旁白句（ID），按首次出现排序。

    手写了 `speech` 的旁白句不检查。
    """
    found: dict[str, list[str]] = {}
    for segment in script.segments:
        for scene in segment.scenes:
            for line in scene.lines:
                if line.speech is not None:
                    continue
                for term in new_terms(line.text, table):
                    found.setdefault(term, []).append(line.id)
    return found


def spoken_text(line: Line, table: dict[str, str]) -> str:
    """交给 TTS 的朗读文本：手写的 `speech` 优先，否则对字幕文本套用读音表。"""
    if line.speech is not None:
        return line.speech
    return apply_pronunciation(line.text, table)
