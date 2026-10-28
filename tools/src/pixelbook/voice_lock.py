"""书的音色：解析、锁定与守卫（ADR-0005）。"""

import json
from pathlib import Path
from typing import Any

import yaml

from pixelbook import REPO_ROOT
from pixelbook.tts_cache import normalized_voice
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


LOCK_NAME = "voice.lock"
LOCK_HEADER = (
    "# 锁定音色（ADR-0005）：这本书第一次正式配音时写入，提交到 git。\n"
    "# 不要手改；要换音色，用 `pixelbook voice <旁白稿> --revoice` 整本书重新配音。\n"
)


def lock_record(voice: Voice) -> dict[str, Any]:
    """锁定音色的内容：完整的音色设置，加上参考音频内容的指纹。

    不含引擎自身的设置（如补静音），也不含随机种子；参考音频不存在时抛
    `FileNotFoundError`。
    """
    record = {"ref_audio": voice.ref_audio, **normalized_voice(voice)}
    order = ["model", "speaker", "instruct", "ref_audio", "ref_audio_sha256"]
    order += ["ref_text", "params"]
    return {k: record[k] for k in order if record[k] not in (None, {})}


def lock_mismatch(book_dir: Path, record: dict[str, Any]) -> list[str] | None:
    """守卫：比较锁定音色和当前音色 `record`，返回不一致之处；没有锁定时返回 None。"""
    path = book_dir / LOCK_NAME
    if not path.is_file():
        return None
    locked = yaml.safe_load(path.read_text())
    if not isinstance(locked, dict):
        return [f"{path} 不是一个映射，读不出锁定音色"]
    return [
        f"{key}：锁定 {_show(locked.get(key))}，当前 {_show(record.get(key))}"
        for key in dict.fromkeys([*locked, *record])
        if locked.get(key) != record.get(key)
    ]


def _show(value: Any) -> str:
    if value is None:
        return "（无）"
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def write_lock(book_dir: Path, record: dict[str, Any]) -> None:
    (book_dir / LOCK_NAME).write_text(
        LOCK_HEADER + yaml.safe_dump(record, allow_unicode=True, sort_keys=False)
    )
