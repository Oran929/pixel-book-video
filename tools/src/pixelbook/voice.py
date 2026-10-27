"""音色设置，以及项目默认音色配置文件的读写。"""

from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class Voice:
    """一份完整的音色设置：模型标识 + 音色来源 + 生成参数。

    音色来源三选一：预设音色 `speaker`（CustomVoice）、音色描述 `instruct`
    （VoiceDesign，只用于试听），或参考音频 `ref_audio` + 逐字一致的
    `ref_text`（Base 克隆）。`ref_audio` 是相对仓库根目录的路径。
    """

    model: str
    speaker: str | None = None
    instruct: str | None = None
    ref_audio: str | None = None
    ref_text: str | None = None
    params: dict[str, Any] = field(default_factory=dict)


PARAM_KEYS = {"language", "temperature", "top_p", "top_k", "repetition_penalty"}


class VoiceConfigError(Exception):
    pass


def unknown_param(params: dict[str, Any]) -> str | None:
    """返回第一个不认识的生成参数，用于在生成前拦住拼写错误。"""
    return next((key for key in params if key not in PARAM_KEYS), None)


def save_voice_config(voice: Voice, path: Path) -> None:
    data = {k: v for k, v in asdict(voice).items() if v not in (None, {})}
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))


def load_voice_config(path: Path) -> Voice:
    """读取项目默认音色配置。配置只能是预设音色或参考音频克隆。"""

    def fail(field_name: str, problem: str) -> VoiceConfigError:
        return VoiceConfigError(f"{path}: `{field_name}` {problem}")

    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        raise VoiceConfigError(f"{path}: 应该是一个映射（键: 值）")

    known = {f.name for f in fields(Voice)}
    for key in data:
        if key not in known:
            raise fail(key, "不是认识的字段")
    if not isinstance(data.get("model"), str) or not data["model"]:
        raise fail("model", "必须是非空的模型标识")
    if "instruct" in data:
        raise fail("instruct", "只用于试听；默认音色要先保存成参考音频再克隆")

    has_ref = "ref_audio" in data or "ref_text" in data
    if "speaker" in data and has_ref:
        raise fail("speaker", "和 `ref_audio`/`ref_text` 只能二选一")
    if "speaker" not in data and not has_ref:
        raise fail("speaker", "缺失：需要 `speaker`，或者 `ref_audio` + `ref_text`")
    if has_ref:
        for key in ("ref_audio", "ref_text"):
            if not isinstance(data.get(key), str) or not data[key]:
                raise fail(key, "缺失：`ref_audio` 和 `ref_text` 必须同时提供")

    params = data.get("params", {})
    if not isinstance(params, dict):
        raise fail("params", "应该是一个映射")
    if key := unknown_param(params):
        raise fail(f"params.{key}", f"不是认识的参数（可用：{sorted(PARAM_KEYS)}）")

    return Voice(**data)
