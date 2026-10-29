"""video/src/style/ascii-advances.json 和像素字体文件一致（#34）。

TypeScript 一侧按这张表估算组件上的字有多宽（`textWidth`），Node 里读不了 woff2，
所以表是从字体文件导出后提交的；换了字体文件，这里会失败，按下面的口径重新导出。
"""

import json

from fontTools.ttLib import TTFont

from pixelbook import REPO_ROOT
from pixelbook.pipeline import SUBTITLE_FONT

ADVANCES = REPO_ROOT / "video" / "src" / "style" / "ascii-advances.json"
# 字体按 12×12 像素格设计（video/src/style/style.ts 的 FONT.designSize）
DESIGN_SIZE = 12


def test_ascii_advances_match_the_pixel_font():
    font = TTFont(REPO_ROOT / "video" / "public" / SUBTITLE_FONT)
    cmap = font.getBestCmap()
    unit = font["head"].unitsPerEm // DESIGN_SIZE
    expected = {}
    for code in range(0x20, 0x7F):
        advance = font["hmtx"][cmap[code]][0]
        assert advance % unit == 0, f"{chr(code)!r} 的步进宽度不是整字体像素"
        expected[chr(code)] = advance // unit

    assert json.loads(ADVANCES.read_text(encoding="utf-8")) == expected


def test_full_width_characters_are_one_em():
    # textWidth 把 ASCII 以外的字一律按 1 个字号宽估算
    font = TTFont(REPO_ROOT / "video" / "public" / SUBTITLE_FONT)
    cmap = font.getBestCmap()
    em = font["head"].unitsPerEm
    for char in "知识，。、；：“”（）！？":
        assert font["hmtx"][cmap[ord(char)]][0] == em, char
