"""音色解析、锁定与守卫（票 06，ADR-0005）。"""

from dataclasses import replace

import pytest

from pixelbook.asr import FakeAsrEngine
from pixelbook.pipeline import PipelineError, voice_episode
from pixelbook.tts import FakeTtsEngine
from pixelbook.verification import Verifier
from pixelbook.voice import Voice, VoiceConfigError, save_voice_config
from pixelbook.voice_lock import resolve_book_voice

DEFAULT = Voice(model="base-model", speaker="Vivian", params={"language": "chinese"})
YUJIE = Voice(model="base-model", speaker="Serena", params={"language": "chinese"})


@pytest.fixture
def repo(tmp_path):
    """临时仓库根目录：项目默认音色 `voice.yaml` 和一本书 `books/demo/`。"""
    save_voice_config(DEFAULT, tmp_path / "voice.yaml")
    (tmp_path / "voices").mkdir()
    save_voice_config(YUJIE, tmp_path / "voices" / "yujie.yaml")
    (tmp_path / "books" / "demo").mkdir(parents=True)
    return tmp_path


def test_book_without_config_uses_the_project_default_voice(repo):
    assert resolve_book_voice(repo / "books" / "demo", repo) == DEFAULT


def test_book_config_can_override_the_voice_with_a_voice_file(repo):
    book = repo / "books" / "demo"
    (book / "book.yaml").write_text("title: 示例书\nvoice: voices/yujie.yaml\n")

    assert resolve_book_voice(book, repo) == YUJIE


def test_book_config_without_voice_uses_the_project_default_voice(repo):
    book = repo / "books" / "demo"
    (book / "book.yaml").write_text("title: 示例书\nauthor: 某人\n")

    assert resolve_book_voice(book, repo) == DEFAULT


@pytest.mark.parametrize(
    ("content", "problem"),
    [
        ("voice: voices/missing.yaml\n", "voices/missing.yaml"),
        ("voice: 42\n", "`voice`"),
        ("- voice\n", "映射"),
    ],
)
def test_bad_book_config_is_rejected_naming_the_file(repo, content, problem):
    book = repo / "books" / "demo"
    (book / "book.yaml").write_text(content)

    with pytest.raises(VoiceConfigError) as error:
        resolve_book_voice(book, repo)
    assert "book.yaml" in str(error.value)
    assert problem in str(error.value)


# ---- 守卫：书解析出的音色 vs 锁定音色 ----

SCRIPT = """\
title: 示例书
segments:
  - id: s01
    title: 开场
    scenes:
      - id: s01-c01
        description: 书的封面
        lines:
          - id: s01-l01
            text: 今天读一本书
            cite: ch01-¶001
"""


def fake_asr_verifier(asr=None, max_retries=2):
    """复核：默认用原样"听见"朗读文本的假识别引擎，阈值 0.1，重试 2 次。"""
    return Verifier(asr or FakeAsrEngine(), max_diff_rate=0.1, max_retries=max_retries)


def _voice(repo, **options):
    """像 `pixelbook voice` 那样：先解析书的音色，再配音。"""
    script = repo / "books" / "demo" / "ch01" / "ep01" / "script.yaml"
    script.parent.mkdir(parents=True, exist_ok=True)
    script.write_text(SCRIPT)
    voice = resolve_book_voice(repo / "books" / "demo", repo)
    return voice_episode(
        script,
        FakeTtsEngine(),
        voice,
        repo / "public",
        {},
        **options,
        verifier=fake_asr_verifier(),
    )


def test_changing_the_project_default_voice_is_refused_for_a_locked_book(repo):
    _voice(repo)
    save_voice_config(replace(DEFAULT, speaker="Ryan"), repo / "voice.yaml")

    with pytest.raises(PipelineError) as error:
        _voice(repo)
    assert "speaker：锁定 Vivian，当前 Ryan" in str(error.value)


@pytest.mark.parametrize("change", ["add", "edit"])
def test_changing_the_book_override_is_refused(repo, change):
    book = repo / "books" / "demo"
    if change == "edit":
        (book / "book.yaml").write_text("voice: voices/yujie.yaml\n")
    _voice(repo)

    if change == "add":
        (book / "book.yaml").write_text("voice: voices/yujie.yaml\n")
    else:
        save_voice_config(replace(YUJIE, params={}), repo / "voices" / "yujie.yaml")

    with pytest.raises(PipelineError, match="锁定"):
        _voice(repo)
