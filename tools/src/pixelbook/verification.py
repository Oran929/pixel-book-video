"""语音识别复核：把识别结果和朗读文本规范化后对比，算出差异率（票 07）。

对比对象是朗读文本（读音替换之后的文本，或手写的 `speech`），不是字幕文本。
两边都用同一个 `normalize`，所以格式差异不会被当成读错。

复核分两步（2026-10-28 用户决定）：先比字，字符差异率不超过阈值就通过；
不通过再把两边转成不带声调的拼音比，拼音差异率不超过同一个阈值也算通过
（识别模型把"它"听成"他"这类同音字不算读错）。两步都不通过才算不通过。
"""

import unicodedata
import warnings
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from functools import cache
from pathlib import Path
from typing import Any

import cn2an
import opencc
import yaml
from pypinyin import Style, lazy_pinyin

from pixelbook.asr import AsrEngine

# `verification.yaml` 里 `asr` 可选的名字 → （模型，传给识别引擎的语言）。
# 归配置这一侧所有，适配器 `mlx_asr` 从这里取，核心模块不依赖具体引擎（票 #30）。
# Whisper 要用带 HuggingFace processor（分词器）的 `-asr-fp16` 版本：
# mlx-community/whisper-large-v3-turbo 只有权重，mlx-audio 载入后识别会报
# "Processor not found"。
ASR_MODELS: dict[str, tuple[str, str]] = {
    "whisper": ("mlx-community/whisper-large-v3-turbo-asr-fp16", "zh"),
    "qwen3-asr": ("Qwen/Qwen3-ASR-1.7B", "Chinese"),
}


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


def pinyin_difference_rate(spoken: str, heard: str) -> float:
    """拼音差异率 = 不带声调的拼音序列的编辑距离 ÷ 朗读文本的字数（规范化之后）。

    规范化之后每个汉字转成一个拼音音节（多音字按词语上下文取读音），英文字母
    和数字不转，每个字符原样算一个单位。所以分母和字符差异率相同，同音字的差别
    消失，读成别的音（"写"读成"选"）仍然算一次编辑。
    """
    expected, actual = _syllables(normalize(spoken)), _syllables(normalize(heard))
    return _edit_distance(expected, actual) / max(len(expected), 1)


def _syllables(text: str) -> list[str]:
    return lazy_pinyin(text, style=Style.NORMAL, errors=lambda chunk: list(chunk))


def _edit_distance(a: Sequence[str], b: Sequence[str]) -> int:
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(
                min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb))
            )
        previous = current
    return previous[-1]


class PassedBy(StrEnum):
    """一版配音靠哪一步复核通过：比字，或者比拼音。"""

    CHARS = "chars"
    PINYIN = "pinyin"


@dataclass(frozen=True)
class Attempt:
    """一版配音的复核结果：识别结果、字符差异率、拼音差异率、靠哪一步通过。

    字符对比通过时不算拼音（`pinyin_diff_rate` 为 None）；两步都不通过时
    `passed_by` 为 None。
    """

    heard: str
    diff_rate: float
    pinyin_diff_rate: float | None
    passed_by: PassedBy | None

    def to_record(self) -> dict[str, Any]:
        return {
            "heard": self.heard,
            "diff_rate": self.diff_rate,
            "pinyin_diff_rate": self.pinyin_diff_rate,
            "passed_by": None if self.passed_by is None else self.passed_by.value,
        }


@dataclass(frozen=True)
class Verification:
    """一句配音的复核结果：每次生成的 `attempts`、选中的 `chosen`、
    当时的阈值和识别引擎设置。存进配音缓存的 `<指纹>.json`。"""

    passed: bool
    chosen: int
    attempts: list[Attempt]
    max_diff_rate: float
    asr: dict[str, Any]

    @property
    def chosen_attempt(self) -> Attempt:
        return self.attempts[self.chosen]

    def to_record(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "chosen": self.chosen,
            "attempts": [attempt.to_record() for attempt in self.attempts],
            "max_diff_rate": self.max_diff_rate,
            "asr": self.asr,
        }

    @classmethod
    def from_record(cls, record: dict[str, Any]) -> "Verification":
        """从缓存里读回复核结果。兼容旧缓存的分支都在这里。

        票 07 改成两步复核之前写的缓存，`attempts` 里没有 `pinyin_diff_rate`
        和 `passed_by`：那时只比过字，所以整句通过就是选中的那一版靠字符通过，
        其余各版都没通过。
        """
        attempts = []
        for i, a in enumerate(record["attempts"]):
            if "passed_by" in a:
                passed_by = None if a["passed_by"] is None else PassedBy(a["passed_by"])
            else:
                # 旧缓存：通过的只能是选中的那一版
                passed = record["passed"] and i == record["chosen"]
                passed_by = PassedBy.CHARS if passed else None
            attempts.append(
                Attempt(
                    heard=a["heard"],
                    diff_rate=a["diff_rate"],
                    pinyin_diff_rate=a.get("pinyin_diff_rate"),
                    passed_by=passed_by,
                )
            )
        return cls(
            passed=record["passed"],
            chosen=record["chosen"],
            attempts=attempts,
            max_diff_rate=record["max_diff_rate"],
            asr=record["asr"],
        )


@dataclass(frozen=True)
class Verifier:
    """复核设置：识别引擎、差异率阈值（超过就不通过）、不通过时最多重试几次。"""

    asr: AsrEngine
    max_diff_rate: float
    max_retries: int

    def check(self, spoken: str, heard: str) -> Attempt:
        """一版配音的复核结果：先比字，不通过再比拼音。"""
        rate = difference_rate(spoken, heard)
        pinyin_rate, passed_by = None, None
        if rate <= self.max_diff_rate:
            passed_by = PassedBy.CHARS
        else:
            pinyin_rate = pinyin_difference_rate(spoken, heard)
            if pinyin_rate <= self.max_diff_rate:
                passed_by = PassedBy.PINYIN
        return Attempt(heard, rate, pinyin_rate, passed_by)


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
