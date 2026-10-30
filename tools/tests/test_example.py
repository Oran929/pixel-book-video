"""范例 `examples/books/pragmatic-programmer/`（#68）：格式变了时范例跟着改，这里先报错。

原书和转换结果不提交，所以只跑不读原文的检查：各文件按当前格式能读进来、旁白稿已定稿、
语义核对结果和旁白稿逐句对得上。分镜的检查在 video/src/episode/example.test.ts。
"""

from pixelbook import REPO_ROOT
from pixelbook.book import load_book_config
from pixelbook.factcheck import load_factcheck
from pixelbook.outline import load_outline
from pixelbook.script import FINAL, load_script

BOOK = REPO_ROOT / "examples" / "books" / "pragmatic-programmer"
EPISODE = BOOK / "ch02" / "ep01"


def test_the_example_book_config_loads():
    assert load_book_config(BOOK).title


def test_the_example_outline_has_the_example_episode():
    outline = load_outline(BOOK / "ch02" / "outline.yaml")

    assert "ep01" in [episode.id for episode in outline.episodes]


def test_the_example_script_is_final_and_factchecked_line_by_line():
    script = load_script(EPISODE / "script.yaml")
    factcheck = load_factcheck(EPISODE / "factcheck.yaml")

    assert script.status == FINAL
    lines = [line.id for line in script.lines]
    assert [line.id for line in factcheck.lines] == lines
