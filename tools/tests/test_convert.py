"""EPUB 转换：每章一份带段落编号的 Markdown（票 #6，ADR-0007）。

EPUB 在测试里用代码生成：container.xml、content.opf、toc.ncx 和几份 XHTML。
"""

import zipfile

import pytest

from pixelbook import cli
from pixelbook.convert import ConvertError, convert_book

XHTML = """\
<?xml version='1.0' encoding='utf-8'?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>t</title></head>
  <body>
{body}
  </body>
</html>
"""


def write_epub(path, files, toc):
    """在 `path` 写一份 EPUB。

    `files` 是 spine 顺序的 (文件名, body 内容)，文件放在 `OEBPS/text/` 下；
    `toc` 是目录顶层条目 (标题, 文件名)。
    """
    manifest = "\n".join(
        f'<item id="f{i}" href="text/{name}" media-type="application/xhtml+xml"/>'
        for i, (name, _) in enumerate(files)
    )
    spine = "\n".join(f'<itemref idref="f{i}"/>' for i in range(len(files)))
    opf = f"""\
<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata/>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    {manifest}
  </manifest>
  <spine toc="ncx">
    {spine}
  </spine>
</package>
"""
    points = "\n".join(
        f'<navPoint id="n{i}"><navLabel><text>{label}</text></navLabel>'
        f'<content src="text/{name}"/></navPoint>'
        for i, (label, name) in enumerate(toc)
    )
    ncx = f"""\
<?xml version='1.0' encoding='utf-8'?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    {points}
  </navMap>
</ncx>
"""
    container = """\
<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""
    with zipfile.ZipFile(path, "w") as epub:
        epub.writestr("mimetype", "application/epub+zip")
        epub.writestr("META-INF/container.xml", container)
        epub.writestr("OEBPS/content.opf", opf)
        epub.writestr("OEBPS/toc.ncx", ncx)
        for name, body in files:
            epub.writestr(f"OEBPS/text/{name}", XHTML.format(body=body))


@pytest.fixture
def book(tmp_path):
    book = tmp_path / "books" / "demo"
    book.mkdir(parents=True)
    return book


def test_one_paragraph_chapter(book):
    write_epub(
        book / "source.epub",
        [("c1.html", '<h1>第1章　开始</h1>\n<p class="content">第一段。</p>')],
        [("第1章 开始", "c1.html")],
    )

    convert_book(book)

    assert (book / "chapters" / "ch01.md").read_text() == (
        "# 第1章　开始\n\nch01-¶001 第一段。\n"
    )


def test_only_chapters_are_converted_and_numbering_restarts_each_chapter(book):
    write_epub(
        book / "source.epub",
        [
            ("preface.html", "<h1>前言</h1>\n<p>前言的话。</p>"),
            ("c1.html", "<h1>第1章　开始</h1>\n<p>一。</p>\n<p>二。</p>"),
            ("c1-unit.html", "<p>三。</p>"),
            ("c2.html", "<h1>第2章　继续</h1>\n<p>四。</p>"),
            ("after.html", "<h1>跋</h1>\n<p>跋的话。</p>"),
        ],
        [
            ("前言", "preface.html"),
            ("第1章 开始", "c1.html"),
            ("第2章 继续", "c2.html"),
            ("跋", "after.html"),
        ],
    )

    written = convert_book(book)

    assert [p.name for p in written] == ["ch01.md", "ch02.md"]
    assert sorted(p.name for p in (book / "chapters").iterdir()) == [
        "ch01.md",
        "ch02.md",
    ]
    assert (book / "chapters" / "ch01.md").read_text() == (
        "# 第1章　开始\n\nch01-¶001 一。\n\nch01-¶002 二。\n\nch01-¶003 三。\n"
    )
    assert (book / "chapters" / "ch02.md").read_text() == (
        "# 第2章　继续\n\nch02-¶001 四。\n"
    )


def test_unit_tip_and_bold_only_headings_are_not_numbered(book):
    write_epub(
        book / "source.epub",
        [
            (
                "c1.html",
                """\
<h1 class="sect">第1章　开始</h1>
<h2 class="sect2">1　第一个单元</h2>
<p class="content">正文。</p>
<h3 class="sect1">提示1　关注你的技艺</h3>
<p class="content_left"><span class="emphasis_bold">挑战</span></p>
<p class="content"><span class="emphasis_bold">练习 1</span>（参考答案见第1页）</p>
<p class="content">有 <span class="emphasis_italic">DRY</span> 和 <b>粗体</b>。</p>""",
            )
        ],
        [("第1章 开始", "c1.html")],
    )

    convert_book(book)

    assert (book / "chapters" / "ch01.md").read_text() == (
        "# 第1章　开始\n\n"
        "## 1　第一个单元\n\n"
        "ch01-¶001 正文。\n\n"
        "### 提示1　关注你的技艺\n\n"
        "#### 挑战\n\n"
        "ch01-¶002 练习 1（参考答案见第1页）\n\n"
        "ch01-¶003 有 DRY 和 粗体。\n"
    )


def test_list_items_and_quotes_are_each_one_paragraph(book):
    write_epub(
        book / "source.epub",
        [
            (
                "c1.html",
                """\
<h1>第1章　开始</h1>
<ul><li>甲</li><li>乙</li></ul>
<blockquote><p>引文一。</p><p>引文二。</p></blockquote>
<p class="content_reference_left">我活着不是为了满足你的期望。</p>
<p class="content_reference">——李小龙</p>""",
            )
        ],
        [("第1章 开始", "c1.html")],
    )

    convert_book(book)

    assert (book / "chapters" / "ch01.md").read_text() == (
        "# 第1章　开始\n\n"
        "ch01-¶001 甲\n\n"
        "ch01-¶002 乙\n\n"
        "ch01-¶003 > 引文一。\n\n"
        "ch01-¶004 > 引文二。\n\n"
        "ch01-¶005 > 我活着不是为了满足你的期望。\n\n"
        "ch01-¶006 > ——李小龙\n"
    )


def test_images_become_numbered_placeholders(book):
    write_epub(
        book / "source.epub",
        [
            (
                "c1.html",
                """\
<h1>第1章　开始</h1>
<div class="picture_figure"><img alt="img" src="../images/00005.jpeg"/></div>
<div class="picture_figure"><img alt="img" src="../images/00006.jpeg"/>\
<p class="picture_figure_title">图 1——管道</p></div>
<p><img alt="img" src="../images/00007.png"/></p>""",
            )
        ],
        [("第1章 开始", "c1.html")],
    )

    convert_book(book)

    assert (book / "chapters" / "ch01.md").read_text() == (
        "# 第1章　开始\n\n"
        "ch01-¶001 [图 images/00005.jpeg]\n\n"
        "ch01-¶002 [图 images/00006.jpeg] 图 1——管道\n\n"
        "ch01-¶003 [图 images/00007.png]\n"
    )


def test_footnotes_are_appended_as_numbered_paragraphs_at_chapter_end(book):
    write_epub(
        book / "source.epub",
        [
            (
                "c1.html",
                """\
<h1>第1章　开始</h1>
<p class="content">正文<a class="footnote_quote" href="c1-end.html#n1">[1]</a>。</p>""",
            ),
            (
                "c1-end.html",
                """\
<p class="content_left"><span class="emphasis_bold">先勿伤害</span>\
<a class="footnote_quote" href="c1-end.html#n2">[2]</a></p>
<p class="content">最后一段。</p>
<hr class="calibre3"/>
<p class="footnote_content"><a href="c1.html#q1">[1]</a>注一。</p>
<p class="footnote_content"><a href="c1-end.html#q2">[2]</a>注二。</p>""",
            ),
        ],
        [("第1章 开始", "c1.html")],
    )

    convert_book(book)

    assert (book / "chapters" / "ch01.md").read_text() == (
        "# 第1章　开始\n\n"
        "ch01-¶001 正文[1]。\n\n"
        "#### 先勿伤害[2]\n\n"
        "ch01-¶002 最后一段。\n\n"
        "---\n\n"
        "ch01-¶003 [1]注一。\n\n"
        "ch01-¶004 [2]注二。\n"
    )


@pytest.mark.parametrize(
    ("body", "element"),
    [
        ("<table><tr><td>格子</td></tr></table>", "<table>"),
        ('<div class="sidebar"><p>侧栏</p></div>', '<div class="sidebar">'),
        ('<p>文字<img src="../images/1.jpeg"/>文字</p>', "<img>"),
    ],
)
def test_unrecognized_block_is_an_error_naming_file_and_element(book, body, element):
    write_epub(
        book / "source.epub",
        [("c1.html", f"<h1>第1章　开始</h1>\n{body}")],
        [("第1章 开始", "c1.html")],
    )

    with pytest.raises(ConvertError) as error:
        convert_book(book)
    assert "text/c1.html" in str(error.value)
    assert element in str(error.value)


def test_superscripts_are_marked_with_a_caret(book):
    write_epub(
        book / "source.epub",
        [
            (
                "c1.html",
                """\
<h1>第1章　开始</h1>
<p>O（C<span class="superscript">n</span>）和 n<sup>2</sup></p>""",
            )
        ],
        [("第1章 开始", "c1.html")],
    )

    convert_book(book)

    assert (book / "chapters" / "ch01.md").read_text() == (
        "# 第1章　开始\n\nch01-¶001 O（C^n）和 n^2\n"
    )


# 一本完整的小书：前言、两章；第 1 章分两个文件，脚注在最后一个文件里
FULL_BOOK = (
    [
        ("preface.html", "<h1>前言</h1>\n<p>前言的话。</p>"),
        (
            "c1.html",
            """\
<h1 class="sect">第1章　务实的哲学</h1>
<p class="content">开篇<a class="footnote_quote" href="c1-unit.html#n1">[1]</a>。</p>""",
        ),
        (
            "c1-unit.html",
            """\
<h2 class="sect2">1　人生是你的</h2>
<p class="content_reference_left">我活着不是为了满足你的期望。</p>
<p class="content_reference">——李小龙</p>
<h3 class="sect1">提示3　你有权选择</h3>
<p class="content_left"><span class="emphasis_bold">挑战</span></p>
<ul><li>想一想。</li><li>再想一想。</li></ul>
<div class="picture_figure"><img alt="img" src="../images/00005.jpeg"/></div>
<p class="content">收尾。</p>
<hr class="calibre3"/>
<p class="footnote_content"><a href="c1.html#q1">[1]</a>译注：注一。</p>""",
        ),
        ("c2.html", '<h1 class="sect">第2章　务实的方法</h1>\n<p>第二章。</p>'),
    ],
    [
        ("前言", "preface.html"),
        ("第1章 务实的哲学", "c1.html"),
        ("第2章 务实的方法", "c2.html"),
    ],
)


def test_full_book_converts_every_kind_of_block(book):
    write_epub(book / "source.epub", *FULL_BOOK)

    convert_book(book)

    assert (book / "chapters" / "ch01.md").read_text() == (
        "# 第1章　务实的哲学\n\n"
        "ch01-¶001 开篇[1]。\n\n"
        "## 1　人生是你的\n\n"
        "ch01-¶002 > 我活着不是为了满足你的期望。\n\n"
        "ch01-¶003 > ——李小龙\n\n"
        "### 提示3　你有权选择\n\n"
        "#### 挑战\n\n"
        "ch01-¶004 想一想。\n\n"
        "ch01-¶005 再想一想。\n\n"
        "ch01-¶006 [图 images/00005.jpeg]\n\n"
        "ch01-¶007 收尾。\n\n"
        "---\n\n"
        "ch01-¶008 [1]译注：注一。\n"
    )
    assert (book / "chapters" / "ch02.md").read_text() == (
        "# 第2章　务实的方法\n\nch02-¶001 第二章。\n"
    )
    converted = "".join(p.read_text() for p in (book / "chapters").iterdir())
    assert "前言" not in converted


def test_converting_twice_gives_byte_identical_output(book):
    write_epub(book / "source.epub", *FULL_BOOK)

    first = {p.name: p.read_bytes() for p in convert_book(book)}
    second = {p.name: p.read_bytes() for p in convert_book(book)}

    assert first == second
    assert list(first) == ["ch01.md", "ch02.md"]


def test_missing_source_epub_is_an_error(book):
    with pytest.raises(ConvertError) as error:
        convert_book(book)
    assert "source.epub" in str(error.value)


def test_convert_command_writes_chapters_and_reports_them(book, capsys):
    write_epub(book / "source.epub", *FULL_BOOK)

    assert cli.main(["convert", str(book)]) == 0

    assert (book / "chapters" / "ch02.md").is_file()
    out = capsys.readouterr().out
    assert "2 章" in out
    assert str(book / "chapters") in out


def test_convert_command_fails_with_the_reason(book, capsys):
    assert cli.main(["convert", str(book)]) == 1

    assert "source.epub" in capsys.readouterr().out


def test_epub_without_chapter_entries_is_an_error(book):
    write_epub(
        book / "source.epub",
        [("preface.html", "<h1>前言</h1>\n<p>前言的话。</p>")],
        [("前言", "preface.html")],
    )

    with pytest.raises(ConvertError) as error:
        convert_book(book)
    assert "第 N 章" in str(error.value)


def test_malformed_xhtml_is_an_error_naming_the_file(book):
    write_epub(
        book / "source.epub",
        [("c1.html", "<h1>第1章　开始</h1>\n<p>没有闭合")],
        [("第1章 开始", "c1.html")],
    )

    with pytest.raises(ConvertError) as error:
        convert_book(book)
    assert "text/c1.html" in str(error.value)
