"""书的音色：解析、锁定与守卫（ADR-0005）。"""

from pathlib import Path

import yaml

from pixelbook import REPO_ROOT
from pixelbook.voice import Voice, VoiceConfigError, load_voice_config

DEFAULT_VOICE = "voice.yaml"
BOOK_CONFIG = "book.yaml"


def resolve_book_voice(book_dir: Path, repo_root: Path = REPO_ROOT) -> Voice:
    """书的音色 = 项目默认音色 `voice.yaml`，除非书配置 `book.yaml` 覆盖。

    覆盖写法是引用一份音色配置文件：`voice: voices/yujie.yaml`（相对仓库根目录）。
    """
    config = book_dir / BOOK_CONFIG
    data = yaml.safe_load(config.read_text()) if config.is_file() else None
    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise VoiceConfigError(f"{config}: 应该是一个映射（键: 值）")
    if "voice" not in data:
        return load_voice_config(repo_root / DEFAULT_VOICE)
    ref = data["voice"]
    if not isinstance(ref, str) or not ref:
        raise VoiceConfigError(
            f"{config}: `voice` 应该是音色配置文件的路径（相对仓库根目录），"
            "如 `voice: voices/yujie.yaml`"
        )
    if not (repo_root / ref).is_file():
        raise VoiceConfigError(f"{config}: `voice` 引用的 {ref} 不存在")
    return load_voice_config(repo_root / ref)
