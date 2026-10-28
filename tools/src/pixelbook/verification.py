"""语音识别复核：把识别结果和朗读文本规范化后对比，算出差异率（票 07）。

对比对象是朗读文本（读音替换之后的文本，或手写的 `speech`），不是字幕文本。
两边都用同一个 `normalize`，所以格式差异不会被当成读错。
"""

import unicodedata
import warnings
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import cn2an
import opencc
import yaml

from pixelbook.asr import AsrEngine
from pixelbook.mlx_asr import ASR_MODELS


@cache
def _t2s() -> opencc.OpenCC:
    return opencc.OpenCC("t2s")


def normalize(text: str) -> str:
    """规范化：统一全角半角，繁体转简体，英文转小写，中文数字转阿拉伯数字，
    最后去掉标点、符号和空白（只留文字和数字）。

    数字转换在去标点之前做，`百分之五十` 和 `50%` 都变成 `50`。
    """
    text = unicodedata.normalize("NFKC", text)
    text = _t2s().convert(text).lower()
    with warnings.catch_warnings():
        # cn2an 遇到它认为格式不对的数字（如 `一二三`）会原样保留并发出警告
        warnings.simplefilter("ignore")
        text = cn2an.transform(text, "cn2an")
    return "".join(ch for ch in text if unicodedata.category(ch)[0] in "LN")


def difference_rate(spoken: str, heard: str) -> float:
    """字符级差异率 = 编辑距离 ÷ 朗读文本的字数（都在规范化之后）。

    多读、漏读、读错各算一次编辑，所以差异率可能大于 1。
    """
    expected, actual = normalize(spoken), normalize(heard)
    return _edit_distance(expected, actual) / max(len(expected), 1)


def _edit_distance(a: str, b: str) -> int:
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(
                min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb))
            )
        previous = current
    return previous[-1]


@dataclass(frozen=True)
class Verifier:
    """复核设置：识别引擎、差异率阈值（超过就不通过）、不通过时最多重试几次。"""

    asr: AsrEngine
    max_diff_rate: float
    max_retries: int


@dataclass(frozen=True)
class VerificationConfig:
    """复核配置文件 `verification.yaml` 的内容。

    不放进音色设置：改它不影响声音，不触发音色锁定守卫，也不让缓存失效。
    """

    asr: str
    max_diff_rate: float
    max_retries: int


class VerificationConfigError(Exception):
    pass


def load_verification_config(path: Path) -> VerificationConfig:
    def fail(field_name: str, problem: str) -> VerificationConfigError:
        return VerificationConfigError(f"{path}: `{field_name}` {problem}")

    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        raise VerificationConfigError(f"{path}: 应该是一个映射（键: 值）")
    for key in data:
        if key not in VerificationConfig.__dataclass_fields__:
            raise fail(key, "不是认识的字段")
    if data.get("asr") not in ASR_MODELS:
        raise fail("asr", f"应该是 {' 或 '.join(ASR_MODELS)}")
    rate = data.get("max_diff_rate")
    if isinstance(rate, bool) or not isinstance(rate, int | float) or rate < 0:
        raise fail("max_diff_rate", "应该是不小于 0 的数（如 0.1）")
    retries = data.get("max_retries")
    if isinstance(retries, bool) or not isinstance(retries, int) or retries < 0:
        raise fail("max_retries", "应该是不小于 0 的整数")
    return VerificationConfig(**data)
