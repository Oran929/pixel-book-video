"""章目录 `books/<书>/<章>/` 和期目录 `books/<书>/<章>/<期>/` 的路径类型。

书、章、期的目录和其中各文件的路径都从这里取，不在别处写 `parents[...]`
或拼接字符串。
"""

import re
from dataclasses import dataclass
from pathlib import Path

from pixelbook.convert import chapter_file

BOOKS_DIR = "books"
# 大纲在章目录里，覆盖整章
OUTLINE_NAME = "outline.yaml"
SCRIPT_NAME = "script.yaml"
FACTCHECK_NAME = "factcheck.yaml"


# 章目录名 `chNN`，和转换结果 `chapters/chNN.md` 同名
CHAPTER_NAME = re.compile(r"^ch(\d{2})$")


class EpisodePathError(Exception):
    pass


@dataclass(frozen=True)
class ChapterPath:
    """一章的章目录 `dir`，即 `books/<书>/chNN/`。"""

    dir: Path

    def __post_init__(self) -> None:
        if not _is_chapter_dir(self.dir):
            raise EpisodePathError(
                f"{self.dir} 不是章目录，章目录应该是 {BOOKS_DIR}/<书>/chNN/"
            )

    @classmethod
    def from_outline(cls, outline: Path) -> "ChapterPath":
        """大纲 `books/<书>/chNN/outline.yaml` 所在的章目录。"""
        if outline.name != OUTLINE_NAME or not _is_chapter_dir(outline.parent):
            raise EpisodePathError(
                f"{outline} 不是大纲，大纲应该在 {BOOKS_DIR}/<书>/chNN/{OUTLINE_NAME}"
            )
        return cls(outline.parent)

    @property
    def book_dir(self) -> Path:
        return self.dir.parent

    @property
    def number(self) -> int:
        return int(CHAPTER_NAME.match(self.dir.name)[1])

    @property
    def outline(self) -> Path:
        return self.dir / OUTLINE_NAME

    @property
    def converted(self) -> Path:
        """这一章的转换结果 `books/<书>/chapters/chNN.md`。"""
        return chapter_file(self.book_dir, self.number)


@dataclass(frozen=True)
class EpisodePath:
    """一期的期目录 `dir`，即 `books/<书>/<章>/<期>/`。"""

    dir: Path

    def __post_init__(self) -> None:
        if not _is_episode_dir(self.dir):
            raise EpisodePathError(
                f"{self.dir} 不是期目录，期目录应该在 {BOOKS_DIR}/<书>/<章>/<期>/"
            )

    @classmethod
    def from_script(cls, script: Path) -> "EpisodePath":
        """旁白稿 `books/<书>/<章>/<期>/script.yaml` 所在的期目录。"""
        if script.name != SCRIPT_NAME or not _is_episode_dir(script.parent):
            raise EpisodePathError(
                f"{script} 不是旁白稿，旁白稿应该在 "
                f"{BOOKS_DIR}/<书>/<章>/<期>/{SCRIPT_NAME}"
            )
        return cls(script.parent)

    @property
    def chapter_dir(self) -> Path:
        return self.dir.parent

    @property
    def chapter(self) -> ChapterPath:
        """期所在的章；章目录名不是 `chNN` 时报错。"""
        return ChapterPath(self.chapter_dir)

    @property
    def book_dir(self) -> Path:
        return self.chapter_dir.parent

    @property
    def outline(self) -> Path:
        return self.chapter_dir / OUTLINE_NAME

    @property
    def script(self) -> Path:
        return self.dir / SCRIPT_NAME

    @property
    def factcheck(self) -> Path:
        return self.dir / FACTCHECK_NAME

    @property
    def id(self) -> str:
        """输出文件名用的 `书-章-期` 标识。"""
        return f"{self.book_dir.name}-{self.chapter_dir.name}-{self.dir.name}"


def _is_chapter_dir(path: Path) -> bool:
    # 章目录往上第二级是 books/
    return (
        len(path.parts) >= 3
        and path.parts[-3] == BOOKS_DIR
        and bool(CHAPTER_NAME.match(path.name))
    )


def _is_episode_dir(path: Path) -> bool:
    # 期目录往上第三级是 books/
    return len(path.parts) >= 4 and path.parts[-4] == BOOKS_DIR
