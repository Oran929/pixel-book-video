"""语音识别复核：把识别结果和朗读文本规范化后对比，算出差异率（票 07）。

对比对象是朗读文本（读音替换之后的文本，或手写的 `speech`），不是字幕文本。
两边都用同一个 `normalize`，所以格式差异不会被当成读错。
"""

import unicodedata
import warnings
from functools import cache

import cn2an
import opencc


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
