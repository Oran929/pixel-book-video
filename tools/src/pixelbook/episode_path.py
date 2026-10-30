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
# 分镜：Claude 手写、提交到 git，`stage` 原样复制给 Remotion（不由 Python 解析）
STORYBOARD_NAME = "storyboard.json"

# 产物目录：命令为这一期生成的文件都写在期目录的 `out/` 里，不提交（ADR-0013）。
# 分镜、产物目录和下面 TS 也读写的文件名，和 video/src/episode/out-dir.ts 一致（有测试核对）
OUT_DIR = "out"
MANIFEST_NAME = "episode.json"
# 检查报告：需要人看的问题（复核未通过的句子……），每次配音重写
REPORT_NAME = "report.json"
# 时间轴导出命令（`npm run timeline`）写出的时间轴和打点时间表
TIMELINE_NAME = "timeline.json"
SEGMENTS_NAME = "segments.txt"
CREDITS_NAME = "credits.txt"
MIX_NAME = "mix.wav"


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
    def storyboard(self) -> Path:
        return self.dir / STORYBOARD_NAME

    @property
    def out_dir(self) -> Path:
        """产物目录 `out/`：这一期生成的文件都在这里（ADR-0013）。"""
        return self.dir / OUT_DIR

    @property
    def manifest(self) -> Path:
        """合成清单，`pixelbook voice` 写出。"""
        return self.out_dir / MANIFEST_NAME

    @property
    def report(self) -> Path:
        """检查报告，`pixelbook voice` 写出。"""
        return self.out_dir / REPORT_NAME

    @property
    def timeline(self) -> Path:
        """时间轴，时间轴导出命令写出。"""
        return self.out_dir / TIMELINE_NAME

    @property
    def segments(self) -> Path:
        """打点时间表，时间轴导出命令写出。"""
        return self.out_dir / SEGMENTS_NAME

    @property
    def credits(self) -> Path:
        """配乐署名，用了 CC-BY 曲子时时间轴导出命令写出。"""
        return self.out_dir / CREDITS_NAME

    @property
    def video(self) -> Path:
        """成片 `<书>-<章>-<期>.mp4`，`pixelbook render` 写出；文件名带完整 ID，拖出去也不重名。"""
        return self.out_dir / f"{self.id}.mp4"

    @property
    def music_stem(self) -> Path:
        """配乐声轨，`pixelbook music-trial` 写出；参照在它旁边（`-reference.wav`）。"""
        return self.out_dir / f"{self.id}-music.wav"

    @property
    def mix(self) -> Path:
        """试听混音，`pixelbook mix` 写出。"""
        return self.out_dir / MIX_NAME

    @property
    def terms_dir(self) -> Path:
        """新术语试听，`pixelbook terms` 写出。"""
        return self.out_dir / "terms"

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
