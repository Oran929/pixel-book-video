"""书仓库：项目仓库忽略 `books/` 时，`ensure_books_repo` 在 `books/` 里建本机的书仓库。"""

import subprocess

import pytest

from pixelbook.books_repo import BOOKS_GITIGNORE, ensure_books_repo, git_root


def _git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


@pytest.fixture
def project(tmp_path):
    _git(tmp_path, "init", "-q")
    return tmp_path


def test_an_ignored_books_dir_becomes_its_own_repo(project):
    (project / ".gitignore").write_text("/books/\n")
    books = project / "books"

    assert ensure_books_repo(books)

    assert git_root(books) == books.resolve()
    assert (books / ".gitignore").read_text() == BOOKS_GITIGNORE
    # 已经是书仓库时不再动它
    assert not ensure_books_repo(books)


def test_a_books_dir_the_project_tracks_is_left_alone(project):
    # 范例的 examples/books/ 和测试的临时仓库都是这样；项目仓库只忽略根目录的 /books/
    (project / ".gitignore").write_text("/books/\n")
    books = project / "examples" / "books"

    assert not ensure_books_repo(books)

    assert git_root(books) == project.resolve()
    assert not (books / ".gitignore").exists()


def test_the_books_repo_ignores_sources_caches_and_outputs(project):
    (project / ".gitignore").write_text("/books/\n")
    books = project / "books"
    ensure_books_repo(books)
    for path in (
        "demo/source.epub",
        "demo/chapters/ch01.md",
        "demo/cache/tts/a.wav",
        "demo/ch01/ep01/out/demo-ch01-ep01.mp4",
        "demo/book.yaml",
        "demo/ch01/outline.yaml",
        "demo/ch01/ep01/storyboard.json",
    ):
        (books / path).parent.mkdir(parents=True, exist_ok=True)
        (books / path).write_text("x")

    _git(books, "add", "-A")
    tracked = subprocess.run(
        ["git", "-C", str(books), "ls-files"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()

    assert sorted(tracked) == [
        ".gitignore",
        "demo/book.yaml",
        "demo/ch01/ep01/storyboard.json",
        "demo/ch01/outline.yaml",
    ]
