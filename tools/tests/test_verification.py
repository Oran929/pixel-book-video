"""语音识别复核的规范化与差异率（票 07）。"""

import pytest

from pixelbook import REPO_ROOT
from pixelbook.mlx_asr import ASR_MODELS
from pixelbook.verification import (
    VerificationConfig,
    VerificationConfigError,
    difference_rate,
    load_verification_config,
    normalize,
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
