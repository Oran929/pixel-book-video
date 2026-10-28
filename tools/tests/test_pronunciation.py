"""读音表与新术语（票 04）：经由配音流水线和读音模块的公开接口验证。"""

import pytest

from pixelbook import REPO_ROOT
from pixelbook.pipeline import PipelineError, voice_episode
from pixelbook.pronunciation import (
    PronunciationError,
    load_pronunciation,
    new_terms,
)
from pixelbook.tts import FakeTtsEngine
from pixelbook.voice import Voice

VOICE = Voice(model="base-model", ref_audio="voices/a.wav", ref_text="你好。")
TABLE = {"DRY": "DRY", "KV Cache": "KV Cache"}


class RecordingEngine(FakeTtsEngine):
    """记下每次交给 TTS 的朗读文本。"""

    def __init__(self):
        self.texts: list[str] = []

    def synthesize(self, text, voice, out):
        self.texts.append(text)
        return super().synthesize(text, voice, out)


def script(*lines: tuple[str, str | None]) -> str:
    """一段一个画面的旁白稿；每项是（字幕文本, 手写的 speech 或 None）。"""
    body = ""
    for n, (text, speech) in enumerate(lines, start=1):
        body += f"          - id: s01-l{n:02d}\n            text: '{text}'\n"
        if speech is not None:
            body += f"            speech: '{speech}'\n"
        body += f"            cite: ch01-¶{n:03d}\n"
    return (
        "segments:\n  - id: s01\n    title: 开场\n    scenes:\n"
        "      - id: s01-c01\n        description: 画面\n        lines:\n" + body
    )


@pytest.fixture
def episode(tmp_path):
    path = tmp_path / "books" / "demo" / "ch01" / "ep01" / "script.yaml"
    path.parent.mkdir(parents=True)

    def voice(text: str, table: dict[str, str]) -> RecordingEngine:
        path.write_text(text)
        engine = RecordingEngine()
        voice_episode(path, engine, VOICE, tmp_path / "public", table)
        return engine

    voice.path = path
    voice.public = tmp_path / "public"
    return voice


def test_spoken_text_replaces_terms_from_the_table(episode):
    engine = episode(script(("Python 读作派森", None)), {"Python": "派森"})

    assert engine.texts == ["派森 读作派森"]


def test_longer_term_wins_over_its_prefix(episode):
    table = {"KV": "K V", "KV Cache": "KV 缓存", "Cache": "缓存"}

    engine = episode(script(("KV Cache 里的 KV", None)), table)

    assert engine.texts == ["KV 缓存 里的 K V"]


def test_replacement_is_case_sensitive_and_deterministic(episode):
    table = {"DRY": "dry 原则", "dry": "干"}
    text = script(("DRY 不是 dry", None))

    first = episode(text, table).texts
    second = episode(text, dict(reversed(table.items()))).texts

    assert first == second == ["dry 原则 不是 干"]


def test_handwritten_speech_wins_over_the_table(episode):
    engine = episode(
        script(("用 KV Cache 加速", "用键值缓存加速")), {"KV Cache": "KV 缓存"}
    )

    assert engine.texts == ["用键值缓存加速"]


def test_unchanged_entry_keeps_spoken_text_as_written(episode):
    engine = episode(script(("第一条原则叫 DRY。", None)), TABLE)

    assert engine.texts == ["第一条原则叫 DRY。"]


@pytest.mark.parametrize(
    ("text", "terms"),
    [
        ("用 KV Cache 加速", []),
        ("KV 和 Cache 分开写", ["KV", "Cache"]),
        ("C++ 和 Node.js。", ["C++", "Node.js"]),
        ("性能提升 30%，第 2 章", []),
        ("I/O 很慢", ["I/O"]),
        ("dry 小写", ["dry"]),
        ("1,000 行、3.5 倍", []),
        ("版本 1.2.3", ["1.2.3"]),
    ],
)
def test_new_term_rules_from_the_ticket(text, terms):
    assert new_terms(text, TABLE) == terms


@pytest.mark.parametrize(
    ("text", "terms"),
    [
        ("OpenAI 和 AI", ["OpenAI"]),
        ("C 和 C++", ["C++"]),
        ("Node.js 不是 Node", ["Node.js"]),
        ("叫 DRY.", []),
        ("(DRY), DRY!", []),
        ("DRY: KV Cache", []),
    ],
)
def test_term_inside_a_longer_fragment_does_not_count_as_registered(text, terms):
    table = {**TABLE, "AI": "诶爱", "C": "C", "Node": "Node"}

    assert new_terms(text, table) == terms


def test_new_terms_refuse_voicing_and_name_the_lines(episode):
    text = script(
        ("KV 和 Cache 分开写", None),
        ("用 KV Cache 加速", None),
        ("C++ 和 KV", None),
        ("I/O 很慢", "爱欧很慢"),
    )

    with pytest.raises(PipelineError) as error:
        episode(text, TABLE)

    message = str(error.value)
    assert "KV：s01-l01、s01-l03" in message
    assert "Cache：s01-l01" in message
    assert "C++：s01-l03" in message
    # 手写了 speech 的句子不检查
    assert "I/O" not in message
    assert not (episode.path.parent / "episode.json").exists()
    assert not (episode.public / "episode").exists()
    assert not (episode.path.parents[2] / "cache").exists()


def test_no_new_terms_means_voicing_runs(episode):
    engine = episode(script(("用 KV Cache 加速", None), ("性能提升 30%", None)), TABLE)

    assert engine.texts == ["用 KV Cache 加速", "性能提升 30%"]


def test_repo_table_starts_with_the_two_confirmed_terms():
    assert load_pronunciation(REPO_ROOT / "pronunciation.yaml") == TABLE


def test_empty_table_file_is_an_empty_table(tmp_path):
    path = tmp_path / "pronunciation.yaml"
    path.write_text("# 还没有条目\n{}\n")

    assert load_pronunciation(path) == {}


@pytest.mark.parametrize(
    ("content", "where"),
    [
        ("- DRY\n", "映射"),
        ("DRY: ''\n", "`DRY`"),
        ("DRY:\n", "`DRY`"),
        ("yes: 是\n", "`True`"),
        ("1.0: 一点零\n", "`1.0`"),
        ("DRY: [D, R, Y]\n", "`DRY`"),
    ],
)
def test_malformed_table_names_the_entry(tmp_path, content, where):
    path = tmp_path / "pronunciation.yaml"
    path.write_text(content)

    with pytest.raises(PronunciationError) as error:
        load_pronunciation(path)

    assert str(path) in str(error.value)
    assert where in str(error.value)
