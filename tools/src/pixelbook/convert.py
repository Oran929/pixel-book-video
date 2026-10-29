"""把书的 EPUB 机械地转成每章一份带段落编号的 Markdown（ADR-0007），以及读回转换结果。

直接解析 EPUB 里的 XHTML，按 spine 顺序读，不调用 pandoc，也不经过模型。
大纲和旁白稿的出处检查用 `read_chapter` 读转换结果，写出格式和读取规则都在这里。
"""

import posixpath
import re
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

SOURCE_NAME = "source.epub"
CHAPTERS_DIR = "chapters"

CONTAINER = "META-INF/container.xml"
NS = {
    "container": "urn:oasis:names:tc:opendocument:xmlns:container",
    "opf": "http://www.idpf.org/2007/opf",
    "ncx": "http://www.daisy.org/z3986/2005/ncx/",
}
XHTML = "{http://www.w3.org/1999/xhtml}"
# 目录里的章条目，如「第2章 务实的方法」
CHAPTER_LABEL = re.compile(r"^第\s*(\d+)\s*章")
# 章标题、单元标题、提示框标题转成 Markdown 标题，不编号
HEADINGS = {"h1": "#", "h2": "##", "h3": "###"}
# 只有一段加粗文字的小标题，如「挑战」「相关部分包括：」
BOLD_HEADING = "####"
# 块的种类：编号段落、脚注（章末编号）、分隔线（正文和脚注之间）
PARAGRAPH = "paragraph"
FOOTNOTE = "footnote"
RULE = "---"
FOOTNOTE_CLASS = "footnote_content"
# 段落里允许的行内元素，只取文字（加粗、斜体不保留）
INLINE = {"span", "a", "b", "strong", "i", "em", "code", "small", "u", "sup", "sub"}
# 上标在前面加 `^`，如 `C^n`
SUPERSCRIPT = {"superscript", "superscript1"}
# 图题，接在图片占位符后面
FIGURE_TITLE = "picture_figure_title"
# 引文段落在编号后面加 `>`
QUOTE = ">"
# 图片段的占位符 `[图 images/00005.jpeg]`，有图题时后面还跟着图题文字
IMAGE = "[图 "
# 段落编号 `chNN-¶NNN`；编号段落一行一个，编号后面空一格接文字
PARAGRAPH_ID = re.compile(r"^ch\d{2}-¶\d{3}$")
PARAGRAPH_LINE = re.compile(r"^(ch\d{2}-¶\d{3}) (.*)$")
# 单元标题 `## 9　DRY——邪恶的重复`（单元号和名字之间是全角空格）
UNIT_LINE = re.compile(r"^## (\d+)　(.*)$")
# 提示框标题 `### 提示15　DRY——不要重复自己`
TIP_LINE = re.compile(r"^### (提示\d+　.*)$")
# 章末脚注以它的编号开头，如 `[18]译注：……`；正文里的标记也写成 `[18]`
FOOTNOTE_LINE = re.compile(r"^\[(\d+)\]")
QUOTE_CLASSES = {
    "content_reference",
    "content_reference_left",
    "content_reference_center",
}


class ConvertError(Exception):
    pass


@dataclass(frozen=True)
class _Chapter:
    number: int
    # 这一章的 XHTML 文件，spine 顺序，路径相对 EPUB 根目录
    files: list[str]
    # content.opf 所在目录：图片占位符里的路径相对它，如 `images/00005.jpeg`
    root: str


def convert_book(book_dir: Path) -> list[Path]:
    """把 `book_dir/source.epub` 转成 `book_dir/chapters/chNN.md`，返回写出的文件。"""
    source = book_dir / SOURCE_NAME
    if not source.is_file():
        raise ConvertError(f"{source} 不存在")
    out_dir = book_dir / CHAPTERS_DIR
    with zipfile.ZipFile(source) as epub:
        chapters = _chapters(epub)
        texts = [(c.number, _chapter_markdown(epub, c)) for c in chapters]
    out_dir.mkdir(exist_ok=True)
    written = []
    for number, text in texts:
        path = out_dir / f"ch{number:02d}.md"
        path.write_bytes(text.encode())
        written.append(path)
    return written


def chapter_file(book_dir: Path, number: int) -> Path:
    """第 `number` 章的转换结果 `book_dir/chapters/chNN.md`。"""
    return book_dir / CHAPTERS_DIR / f"ch{number:02d}.md"


def paragraph_id(chapter: int, number: int) -> str:
    return f"ch{chapter:02d}-¶{number:03d}"


@dataclass(frozen=True)
class Paragraph:
    """转换结果里的一个编号段落。"""

    id: str
    # 编号后面的文字：引文以 `> ` 开头，图片段以占位符开头
    text: str
    # 所在单元的单元号；章首导语和章末脚注不属于任何单元
    unit: int | None
    # 章末脚注：它的标记 `[N]` 所在的段落；标记在标题里时，是标题后面的第一个编号段落
    marked_in: str | None = None
    # 紧挨在这一段前面、后面的提示框标题（`### 提示N　…`，去掉脚注标记），没有时为 None。
    # 提示框只有标题，不是编号段落，引用不到；核对材料和照搬检查经由相邻的段落用它
    tip_before: str | None = None
    tip_after: str | None = None

    @property
    def is_image(self) -> bool:
        return self.text.startswith(IMAGE)


@dataclass(frozen=True)
class Unit:
    number: int
    name: str
    # 单元覆盖的段落编号，按原文顺序：从单元标题到下一个 `##` 标题或章末分隔线
    paragraphs: list[str]


@dataclass(frozen=True)
class Chapter:
    """读回的一章转换结果。"""

    # 段落编号 → 段落，按原文顺序
    paragraphs: dict[str, Paragraph] = field(default_factory=dict)
    # 单元号 → 单元，按原文顺序
    units: dict[int, Unit] = field(default_factory=dict)


def read_chapter(path: Path) -> Chapter:
    """读 `pixelbook convert` 写出的 `chNN.md`：编号段落和单元，以及脚注标记在哪一段。"""
    chapter = Chapter()
    unit: Unit | None = None
    marks = _Marks()
    in_notes = False
    # 提示框：等着挂到下一段上的标题，和紧挨在提示框前面的那一段（中间隔着别的标题就不算）
    tip: str | None = None
    previous: str | None = None
    for line in path.read_text().splitlines():
        if match := UNIT_LINE.match(line):
            unit = Unit(int(match[1]), match[2], [])
            chapter.units[unit.number] = unit
        elif line == RULE:
            unit, in_notes = None, True
        elif line.startswith("## "):
            unit = None
        if line.startswith("#") or line == RULE:
            marks.scan(line, None)
            tip = None
            if match := TIP_LINE.match(line):
                tip = re.sub(r"\[\d+\]", "", match[1]).strip()
                if previous:
                    chapter.paragraphs[previous] = replace(
                        chapter.paragraphs[previous], tip_after=tip
                    )
            previous = None
        elif match := PARAGRAPH_LINE.match(line):
            id, text = match[1], match[2]
            note = FOOTNOTE_LINE.match(text) if in_notes else None
            if not in_notes:
                marks.scan(text, id)
            chapter.paragraphs[id] = Paragraph(
                id,
                text,
                unit.number if unit else None,
                marked_in=marks.found.get(int(note[1])) if note else None,
                tip_before=tip,
            )
            tip, previous = None, id
            if unit:
                unit.paragraphs.append(id)
    return chapter


class _Marks:
    """正文里的脚注标记 `[1]`、`[2]`……按编号顺序出现；一个一个往后找，免得把代码里的
    `a[1]` 之类当成标记。标题里的标记先挂起，记到标题后面的第一个编号段落上。"""

    def __init__(self):
        self.found: dict[int, str] = {}
        self.pending: list[int] = []

    def scan(self, text: str, paragraph: str | None) -> None:
        if paragraph is not None:
            self.found |= dict.fromkeys(self.pending, paragraph)
            self.pending = []
        position = 0
        while (position := text.find(f"[{self._next}]", position)) >= 0:
            if paragraph is None:
                self.pending.append(self._next)
            else:
                self.found[self._next] = paragraph
            position += 1

    @property
    def _next(self) -> int:
        return len(self.found) + len(self.pending) + 1


def parse_cite(value: Any) -> list[str] | None:
    """出处的写法：一个段落编号，或段落编号的非空列表（不支持范围）。

    写法对时返回编号列表，不对时返回 None。大纲和旁白稿的 `cite` 写法相同。
    """
    ids = value if isinstance(value, list) and value else [value]
    if all(isinstance(i, str) and PARAGRAPH_ID.match(i) for i in ids):
        return ids
    return None


def _chapters(epub: zipfile.ZipFile) -> list[_Chapter]:
    """按目录（NCX）里「第 N 章」的顶层条目切出各章。

    一章从它的条目指向的文件起，到目录里下一个顶层条目指向的文件为止（spine 顺序）；
    前言、跋、参考答案等其他顶层条目只用来划界，不转换。
    """
    opf_path = _xml(epub, CONTAINER).find(".//container:rootfile", NS).get("full-path")
    opf = _xml(epub, opf_path)
    base = posixpath.dirname(opf_path)
    manifest = {
        item.get("id"): item for item in opf.findall("opf:manifest/opf:item", NS)
    }
    spine_el = opf.find("opf:spine", NS)
    spine = [
        _join(base, manifest[ref.get("idref")].get("href"))
        for ref in spine_el.findall("opf:itemref", NS)
    ]
    if spine_el.get("toc") not in manifest:
        # 只有 EPUB 3 导航文档、没有 NCX 的书，要先补上读导航文档的规则
        raise ConvertError(f"{opf_path}: spine 没有指向 NCX 目录（toc），无法分章")
    ncx_path = _join(base, manifest[spine_el.get("toc")].get("href"))
    ncx = _xml(epub, ncx_path)
    entries = []
    for point in ncx.findall("ncx:navMap/ncx:navPoint", NS):
        label = point.findtext("ncx:navLabel/ncx:text", "", NS).strip()
        src = point.find("ncx:content", NS).get("src").split("#")[0]
        target = _join(posixpath.dirname(ncx_path), src)
        if target not in spine:
            raise ConvertError(
                f"{ncx_path}: 条目「{label}」指向的 {target} 不在 spine 里"
            )
        entries.append((label, spine.index(target)))
    chapters = []
    for i, (label, start) in enumerate(entries):
        if match := CHAPTER_LABEL.match(label):
            end = entries[i + 1][1] if i + 1 < len(entries) else len(spine)
            chapters.append(_Chapter(int(match[1]), spine[start:end], base))
    if not chapters:
        raise ConvertError(f"{ncx_path}: 目录里没有「第 N 章」的顶层条目，无法分章")
    return chapters


def _chapter_markdown(epub: zipfile.ZipFile, chapter: _Chapter) -> str:
    blocks = []
    footnotes = []
    for name in chapter.files:
        body = _xml(epub, name).find(f"{XHTML}body")
        for el in body:
            try:
                converted = list(_blocks(el, _Images(name, chapter.root)))
            except _Unrecognized as error:
                raise ConvertError(
                    f"{name}: 无法识别的块级元素 {_describe(error.element)}"
                    "（转换规则覆盖不到，不能丢掉，先补上规则）"
                ) from None
            for kind, text in converted:
                if kind == FOOTNOTE:
                    footnotes.append(text)
                else:
                    blocks.append((kind, text))
    # 脚注按出现顺序追加在章末，和正文连续编号
    if footnotes:
        blocks.append((RULE, ""))
        blocks += [(PARAGRAPH, text) for text in footnotes]
    lines = []
    count = 0
    for kind, text in blocks:
        if kind == PARAGRAPH:
            count += 1
            lines.append(f"{paragraph_id(chapter.number, count)} {text}")
        else:
            lines.append(f"{kind} {text}".rstrip())
    return "\n\n".join(lines) + "\n"


def _blocks(el: ET.Element, images: "_Images") -> Iterator[tuple[str, str]]:
    """一个块级元素转出的块：(种类, 文字)。

    种类是编号段落 `PARAGRAPH`、脚注 `FOOTNOTE`，或 Markdown 标题记号（不编号）。
    """
    tag = _tag(el)
    classes = set(_classes(el))
    if figure := _figure(el, images):
        yield PARAGRAPH, figure
    elif tag in HEADINGS:
        yield HEADINGS[tag], _text(el)
    elif tag == "hr":
        # 正文和脚注之间的分隔线；脚注前的分隔线由转换统一加
        return
    elif tag in ("ul", "ol"):
        for item in _children(el, "li"):
            yield PARAGRAPH, _text(item)
    elif tag == "blockquote":
        for p in _children(el, "p"):
            yield PARAGRAPH, f"{QUOTE} {_text(p)}"
    elif tag == "p" and FOOTNOTE_CLASS in classes:
        yield FOOTNOTE, _text(el)
    elif tag == "p" and _is_bold_only(el):
        yield BOLD_HEADING, _text(el)
    elif tag == "p" and QUOTE_CLASSES & classes:
        yield PARAGRAPH, f"{QUOTE} {_text(el)}"
    elif tag == "p":
        yield PARAGRAPH, _text(el)
    else:
        raise _Unrecognized(el)


class _Unrecognized(Exception):
    """转换规则覆盖不到的元素；转换时补上文件名，报成 `ConvertError`。"""

    def __init__(self, element: ET.Element):
        self.element = element


def _children(el: ET.Element, tag: str) -> list[ET.Element]:
    """`el` 的子元素，必须都是 `tag`（如列表里只有 `li`），否则报错。"""
    if (el.text or "").strip():
        raise _Unrecognized(el)
    for child in el:
        if _tag(child) != tag or (child.tail or "").strip():
            raise _Unrecognized(child)
    return list(el)


def _describe(el: ET.Element) -> str:
    cls = el.get("class")
    return f'<{_tag(el)} class="{cls}">' if cls else f"<{_tag(el)}>"


@dataclass(frozen=True)
class _Images:
    """把 XHTML 文件 `name` 里的图片引用换成相对 `root` 的路径。"""

    name: str
    root: str

    def placeholder(self, img: ET.Element) -> str:
        path = _join(posixpath.dirname(self.name), img.get("src", ""))
        return f"{IMAGE}{posixpath.relpath(path, self.root or '.')}]"


def _figure(el: ET.Element, images: _Images) -> str | None:
    """只含一张图片（和可选的图题）的块：图片占位符，有图题时接在后面。"""
    children = list(el)
    if _tag(el) not in ("div", "p") or (el.text or "").strip() or not children:
        return None
    img, *rest = children
    if _tag(img) != "img" or (img.tail or "").strip():
        return None
    if not rest:
        return images.placeholder(img)
    if len(rest) == 1 and FIGURE_TITLE in _classes(rest[0]):
        return f"{images.placeholder(img)} {_text(rest[0])}"
    return None


def _is_bold_only(p: ET.Element) -> bool:
    """只有一段加粗文字的段落（小标题），如「挑战」；后面可以跟脚注标记。"""
    first, *rest = list(p) or [None]
    return (
        first is not None
        and _is_bold(first)
        and all(_is_footnote_mark(el) for el in rest)
        and not (p.text or "").strip()
        and not any((el.tail or "").strip() for el in p)
    )


def _is_footnote_mark(el: ET.Element) -> bool:
    return _tag(el) == "a" and any(c.startswith("footnote_quote") for c in _classes(el))


def _is_bold(el: ET.Element) -> bool:
    return _tag(el) in ("b", "strong") or "emphasis_bold" in _classes(el)


def _tag(el: ET.Element) -> str:
    return el.tag.removeprefix(XHTML)


def _classes(el: ET.Element) -> list[str]:
    return (el.get("class") or "").split()


def _text(el: ET.Element) -> str:
    """块里的文字，空白合并成一个空格；里面只能有行内元素，否则报错。"""
    return re.sub(r"[ \t\r\n]+", " ", _inline(el)).strip()


def _inline(el: ET.Element) -> str:
    parts = [el.text or ""]
    for child in el:
        if _tag(child) not in INLINE:
            raise _Unrecognized(child)
        text = _inline(child)
        if _tag(child) == "sup" or SUPERSCRIPT & set(_classes(child)):
            text = f"^{text}"
        parts += [text, child.tail or ""]
    return "".join(parts)


def _xml(epub: zipfile.ZipFile, name: str) -> ET.Element:
    try:
        return ET.fromstring(epub.read(name))
    except KeyError:
        raise ConvertError(f"EPUB 里没有 {name}") from None
    except ET.ParseError as error:
        raise ConvertError(f"{name}: 不是合法的 XML（{error}）") from None


def _join(base: str, href: str) -> str:
    return posixpath.normpath(posixpath.join(base, href))
