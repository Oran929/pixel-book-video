"""书配置 `book.yaml`：书名、作者、出版社和可选的音色覆盖（票 #6）。"""

import pytest

from pixelbook.book import BookConfig, BookConfigError, load_book_config


def test_book_config_reads_title_author_and_publisher(tmp_path):
    (tmp_path / "book.yaml").write_text(
        "title: 程序员修炼之道\nauthor: David Thomas、Andrew Hunt\n"
        "publisher: 电子工业出版社\nvoice: voices/yujie.yaml\n"
    )

    assert load_book_config(tmp_path) == BookConfig(
        title="程序员修炼之道",
        author="David Thomas、Andrew Hunt",
        publisher="电子工业出版社",
        voice="voices/yujie.yaml",
    )


def test_missing_book_config_has_every_field_empty(tmp_path):
    assert load_book_config(tmp_path) == BookConfig()


@pytest.mark.parametrize("field", ["title", "author", "publisher"])
def test_book_info_field_must_be_a_non_empty_string(tmp_path, field):
    (tmp_path / "book.yaml").write_text(f"{field}: 42\n")

    with pytest.raises(BookConfigError) as error:
        load_book_config(tmp_path)
    assert "book.yaml" in str(error.value)
    assert f"`{field}`" in str(error.value)
