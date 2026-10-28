"""缺字检查：字幕文本里的字在像素字体里有没有字形（票 09）。

缺字时浏览器会悄悄换成系统字体，画面上混进一个非像素的字，所以配音时就查出来。
"""

from collections.abc import Iterable
from pathlib import Path

from fontTools.ttLib import TTFont


def missing_glyphs(
    lines: Iterable[tuple[str, str]], font: Path
) -> list[dict[str, str]]:
    """`lines` 是 (旁白句 ID, 字幕文本)；返回字体里没有字形的字，每句每字一项。

    空白不检查（换行、空格不画字形）。
    """
    charset = TTFont(font, lazy=True).getBestCmap()
    found = []
    for line_id, text in lines:
        seen = set()
        for char in text:
            if char.isspace() or char in seen or ord(char) in charset:
                continue
            seen.add(char)
            found.append({"id": line_id, "char": char})
    return found
