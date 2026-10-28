"""音色解析、锁定与守卫（票 06，ADR-0005）。"""

import pytest

from pixelbook.voice import Voice, VoiceConfigError, save_voice_config
from pixelbook.voice_lock import resolve_book_voice

DEFAULT = Voice(model="base-model", speaker="Vivian", params={"language": "chinese"})
YUJIE = Voice(model="base-model", speaker="Serena", params={"language": "chinese"})


@pytest.fixture
def repo(tmp_path):
    """临时仓库根目录：项目默认音色 `voice.yaml` 和一本书 `books/demo/`。"""
    save_voice_config(DEFAULT, tmp_path / "voice.yaml")
    (tmp_path / "voices").mkdir()
    save_voice_config(YUJIE, tmp_path / "voices" / "yujie.yaml")
    (tmp_path / "books" / "demo").mkdir(parents=True)
    return tmp_path


def test_book_without_config_uses_the_project_default_voice(repo):
    assert resolve_book_voice(repo / "books" / "demo", repo) == DEFAULT


def test_book_config_can_override_the_voice_with_a_voice_file(repo):
    book = repo / "books" / "demo"
    (book / "book.yaml").write_text("title: 示例书\nvoice: voices/yujie.yaml\n")

    assert resolve_book_voice(book, repo) == YUJIE


def test_book_config_without_voice_uses_the_project_default_voice(repo):
    book = repo / "books" / "demo"
    (book / "book.yaml").write_text("title: 示例书\nauthor: 某人\n")

    assert resolve_book_voice(book, repo) == DEFAULT


@pytest.mark.parametrize(
    ("content", "problem"),
    [
        ("voice: voices/missing.yaml\n", "voices/missing.yaml"),
        ("voice: 42\n", "`voice`"),
        ("- voice\n", "映射"),
    ],
)
def test_bad_book_config_is_rejected_naming_the_file(repo, content, problem):
    book = repo / "books" / "demo"
    (book / "book.yaml").write_text(content)

    with pytest.raises(VoiceConfigError) as error:
        resolve_book_voice(book, repo)
    assert "book.yaml" in str(error.value)
    assert problem in str(error.value)
