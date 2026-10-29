"""照搬原文的判定：大纲的观点、旁白稿的字幕和它们引用的段落用同一个口径比较。

两边都去掉空白和标点，有 `COPIED_CHARS` 个字以上连续相同就算疑似照搬，只警告：
术语、专有名词有时只能照用，由人判断。提示框标题本来就可以照用，不算。
"""

import unicodedata

from pixelbook.convert import Paragraph

COPIED_CHARS = 12


def copied(text: str, paragraph: Paragraph) -> str | None:
    """`text` 和文字段 `paragraph` 最长的连续相同片段，够 `COPIED_CHARS` 个字时返回它。

    提示框标题可以照用：`text` 里照用了紧挨着这一段的提示框标题（`提示N` 后面的部分）时，
    那一截不参与比较，正文复述了标题也不算照搬。
    """
    if paragraph.is_image:
        return None
    text = bare(text)
    for tip in (paragraph.tip_before, paragraph.tip_after):
        if tip:
            # 换成一个不会出现在正文里的字符，前后两截不会被连起来
            text = text.replace(bare(tip.split("　", 1)[-1]), "\0")
    piece = _longest_common(text, bare(paragraph.text))
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
