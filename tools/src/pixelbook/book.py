"""书配置 `books/<书>/book.yaml`：书名、作者、出版社，和可选的音色覆盖。"""

from dataclasses import dataclass
from pathlib import Path

import yaml

from pixelbook.voice import VoiceConfigError

BOOK_CONFIG = "book.yaml"
# 书的信息，写简介时照着写；都可以不写
INFO_FIELDS = ("title", "author", "publisher")


class BookConfigError(VoiceConfigError):
    """书配置写错了。书配置也决定书的音色，所以算作音色配置错误的一种。"""


@dataclass(frozen=True)
class BookConfig:
    title: str | None = None
    author: str | None = None
    publisher: str | None = None
    # 覆盖项目默认音色的音色配置文件（相对仓库根目录），如 `voices/yujie.yaml`
    voice: str | None = None


def load_book_config(book_dir: Path) -> BookConfig:
    """读 `book_dir/book.yaml`；文件不存在时每项都为空。"""
    path = book_dir / BOOK_CONFIG
    data = yaml.safe_load(path.read_text()) if path.is_file() else None
    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise BookConfigError(f"{path}: 应该是一个映射（键: 值）")
    for field in INFO_FIELDS:
        if field in data and not (isinstance(data[field], str) and data[field]):
            raise BookConfigError(f"{path}: `{field}` 应该是一段非空文字")
    voice = data.get("voice")
    if "voice" in data and not (isinstance(voice, str) and voice):
        raise BookConfigError(
            f"{path}: `voice` 应该是音色配置文件的路径（相对仓库根目录），"
            "如 `voice: voices/yujie.yaml`"
        )
    return BookConfig(**{f: data.get(f) for f in (*INFO_FIELDS, "voice")})
