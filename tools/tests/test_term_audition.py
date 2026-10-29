"""新术语试听（票 04）：每个新术语一段音频。"""

import pytest

from pixelbook.audio import wav_seconds
from pixelbook.term_audition import audition_terms
from pixelbook.tts import FakeTtsEngine
from pixelbook.voice import Voice

VOICE = Voice(model="base-model", ref_audio="voices/a.wav", ref_text="你好。")
TABLE = {"DRY": "DRY", "KV Cache": "KV Cache"}

SCRIPT = """\
title: 示例书
status: final
segments:
  - id: s01
    title: 开场
    scenes:
      - id: s01-c01
        description: 画面
        lines:
          - id: s01-l01
            text: 用 KV Cache 加速 I/O
            cite: ch01-¶001
          - id: s01-l02
            text: Dry 和 dry 和 I/O
            cite: ch01-¶002
          - id: s01-l03
            text: C++ 很难
            speech: C 加加很难
            cite: ch01-¶003
"""


def test_each_new_term_gets_its_own_audio_named_after_it(tmp_path):
    script_path = tmp_path / "script.yaml"
    script_path.write_text(SCRIPT)
    out = tmp_path / "terms"
    out.mkdir()
    (out / "old.wav").write_bytes(b"old")

    terms = audition_terms(script_path, TABLE, FakeTtsEngine(), VOICE, out)

    assert [(t["term"], t["lines"], t["file"].name) for t in terms] == [
        ("I/O", ["s01-l01", "s01-l02"], "I_O.wav"),
        ("Dry", ["s01-l02"], "Dry.wav"),
        # macOS 的文件名不区分大小写，和 Dry.wav 撞名时加编号
        ("dry", ["s01-l02"], "dry-2.wav"),
    ]
    # 假引擎每个字 0.2 秒：音频读的就是术语本身
    assert [wav_seconds(t["file"]) for t in terms] == pytest.approx([0.6, 0.6, 0.6])
    assert sorted(p.name for p in out.iterdir()) == ["Dry.wav", "I_O.wav", "dry-2.wav"]


def test_no_new_terms_produces_no_audio(tmp_path):
    script_path = tmp_path / "script.yaml"
    script_path.write_text(SCRIPT.replace("I/O", "").replace("Dry 和 dry", "DRY"))

    terms = audition_terms(script_path, TABLE, FakeTtsEngine(), VOICE, tmp_path / "t")

    assert terms == []
    assert list((tmp_path / "t").iterdir()) == []
