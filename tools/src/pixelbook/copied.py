"""照搬原文的判定：大纲的观点、旁白稿的字幕和它们引用的段落用同一个口径比较。

两边都去掉空白和标点，有 `COPIED_CHARS` 个字以上连续相同就算疑似照搬，只警告：
术语、专有名词有时只能照用，由人判断。
"""

import unicodedata

from pixelbook.convert import Paragraph

COPIED_CHARS = 12


def copied(text: str, paragraph: Paragraph) -> str | None:
    """`text` 和文字段 `paragraph` 最长的连续相同片段，够 `COPIED_CHARS` 个字时返回它。"""
    if paragraph.is_image:
        return None
    piece = _longest_common(bare(text), bare(paragraph.text))
    return piece if len(piece) >= COPIED_CHARS else None


def copied_message(cited: str, piece: str) -> str:
    return f"和 {cited} 有 {len(piece)} 个字连续相同（{piece}），疑似照搬原文"


def bare(text: str) -> str:
    """去掉空白和标点（Unicode 类别 P*）。"""
    return "".join(
        c for c in text if not c.isspace() and unicodedata.category(c)[0] != "P"
    )


def _longest_common(short: str, long: str) -> str:
    """`short` 里同时出现在 `long` 里的最长连续片段；旁白句和观点都不长，直接枚举。"""
    for size in range(len(short), 0, -1):
        for start in range(len(short) - size + 1):
            if (piece := short[start : start + size]) in long:
                return piece
    return ""
