"""语音识别复核的规范化与差异率（票 07）。"""

import subprocess
import sys

import pytest

from pixelbook import REPO_ROOT
from pixelbook.verification import (
    ASR_MODELS,
    VerificationConfig,
    VerificationConfigError,
    difference_rate,
    load_verification_config,
    normalize,
    pinyin_difference_rate,
)


@pytest.mark.parametrize(
    ("spoken", "heard"),
    [
        ("今天讀書", "今天读书"),
        ("第2章", "第二章"),
        ("DRY原则", "d.r.y. 原则"),
        ("KV Cache", "kv cache"),
        ("所以，每条知识只写一次。", "所以每条知识只写一次"),
        ("第一条原则叫 DRY。", "第一条原则叫D R Y"),
        ("ＫＶ　Ｃａｃｈｅ", "KV Cache"),
        ("一步一步", "一步一步"),
    ],
)
def test_format_differences_normalize_to_the_same_text(spoken, heard):
    assert normalize(spoken) == normalize(heard)
    assert difference_rate(spoken, heard) == 0


def test_difference_rate_is_edits_per_character_of_the_spoken_text():
    # 规范化后 10 个字，错 1 个
    assert difference_rate("所以，每条知识只写一次。", "所以每条知识只选一次") == 0.1
    # 漏读 3 个字
    assert difference_rate("意思是不要重复你自己", "意思是不要重复") == pytest.approx(
        0.3
    )
    # 多读的字也算
    assert difference_rate("读书", "读书读书") == 1.0


def test_nothing_heard_is_a_complete_difference():
    assert difference_rate("今天读一本书", "") == 1.0


def _config(tmp_path, text):
    path = tmp_path / "verification.yaml"
    path.write_text(text)
    return path


def test_verification_config_names_the_asr_model_threshold_and_retries(tmp_path):
    path = _config(tmp_path, "asr: whisper\nmax_diff_rate: 0.2\nmax_retries: 3\n")

    assert load_verification_config(path) == VerificationConfig(
        asr="whisper", max_diff_rate=0.2, max_retries=3
    )


def test_repo_verification_config_is_valid():
    config = load_verification_config(REPO_ROOT / "verification.yaml")

    assert config.asr in ASR_MODELS


@pytest.mark.parametrize(
    ("text", "field"),
    [
        ("asr: wisper\nmax_diff_rate: 0.1\nmax_retries: 2\n", "asr"),
        ("asr: whisper\nmax_diff_rate: -0.1\nmax_retries: 2\n", "max_diff_rate"),
        ("asr: whisper\nmax_diff_rate: '0.1'\nmax_retries: 2\n", "max_diff_rate"),
        ("asr: whisper\nmax_diff_rate: 0.1\nmax_retries: 1.5\n", "max_retries"),
        ("asr: whisper\nmax_diff_rate: 0.1\n", "max_retries"),
        ("asr: whisper\nmax_diff_rate: 0.1\nmax_retries: 2\nretry: 1\n", "retry"),
    ],
)
def test_bad_verification_config_names_the_field(tmp_path, text, field):
    path = _config(tmp_path, text)

    with pytest.raises(VerificationConfigError) as error:
        load_verification_config(path)
    assert str(path) in str(error.value)
    assert f"`{field}`" in str(error.value)


@pytest.mark.parametrize(
    ("spoken", "heard", "rate"),
    [
        # 同音字：字不同，拼音相同
        ("它讲的是怎样把代码写好", "他讲的是怎样把代码写好", 0),
        # 声调不同也算相同
        ("只写一次", "只谢一次", 0),
        # 读成别的音
        ("所以每条知识只写一次", "所以每条知识只选一次", 0.1),
        # 英文字母和数字不转拼音，每个字符算一个单位，先按规范化统一格式
        ("DRY原则", "d.r.y. 原则", 0),
        ("KV Cache", "kv cash", 2 / 7),
        ("第2章", "第二章", 0),
        ("第2章", "第3章", 1 / 3),
        # 漏读
        ("意思是不要重复你自己", "意思是不要重复", pytest.approx(0.3)),
    ],
)
def test_pinyin_difference_rate_ignores_homophones_and_tones(spoken, heard, rate):
    assert pinyin_difference_rate(spoken, heard) == rate


def test_verification_does_not_depend_on_a_concrete_asr_engine():
    # 核心模块不依赖具体的语音识别适配器（票 #30）：在干净的解释器里导入，
    # 连间接导入也算
    probe = (
        "import sys, pixelbook.verification; print('pixelbook.mlx_asr' in sys.modules)"
    )
    result = subprocess.run(
        [sys.executable, "-c", probe], capture_output=True, text=True, check=True
    )

    assert result.stdout.strip() == "False"
