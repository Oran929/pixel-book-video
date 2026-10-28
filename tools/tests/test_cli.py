"""命令行：`voice` 和 `terms` 用书解析出的音色（票 06）。

真实 TTS 引擎换成记录音色的假引擎，仓库根目录换成临时目录。
"""

import pytest
import yaml

from pixelbook import cli
from pixelbook.asr import FakeAsrEngine
from pixelbook.tts import FakeTtsEngine
from pixelbook.voice import Voice, save_voice_config

DEFAULT = Voice(model="base-model", speaker="Vivian")
YUJIE = Voice(model="base-model", speaker="Serena")

SCRIPT = """\
segments:
  - id: s01
    title: 开场
    scenes:
      - id: s01-c01
        description: 书的封面
        lines:
          - id: s01-l01
            text: 今天读一本 DRY 的书
            cite: ch01-¶001
"""


class RecordingEngine(FakeTtsEngine):
    def __init__(self):
        super().__init__()
        self.voices = []

    def synthesize(self, text, voice, out):
        self.voices.append(voice)
        return super().synthesize(text, voice, out)


@pytest.fixture
def engine(monkeypatch):
    engine = RecordingEngine()
    monkeypatch.setattr("pixelbook.qwen_tts.QwenTtsEngine", lambda: engine)
    return engine


@pytest.fixture
def repo(tmp_path, monkeypatch):
    save_voice_config(DEFAULT, tmp_path / "voice.yaml")
    (tmp_path / "voices").mkdir()
    save_voice_config(YUJIE, tmp_path / "voices" / "yujie.yaml")
    (tmp_path / "pronunciation.yaml").write_text("DRY: D R Y\n")
    (tmp_path / "verification.yaml").write_text(
        "asr: whisper\nmax_diff_rate: 0.1\nmax_retries: 1\n"
    )
    monkeypatch.setattr(cli, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(cli, "PRONUNCIATION", tmp_path / "pronunciation.yaml")
    monkeypatch.setattr(cli, "VERIFICATION", tmp_path / "verification.yaml")
    monkeypatch.setattr(cli, "VIDEO_PUBLIC", tmp_path / "public")
    script = tmp_path / "books" / "demo" / "ch01" / "ep01" / "script.yaml"
    script.parent.mkdir(parents=True)
    script.write_text(SCRIPT)
    return tmp_path


class NamedAsrEngine(FakeAsrEngine):
    def __init__(self, name, mishear=None):
        super().__init__(mishear)
        self.name = name


@pytest.fixture
def asr(monkeypatch):
    """把真实识别引擎换成假的；`asr.mishear` 设定听错的句子，`asr.engines` 记录创建的引擎。"""

    class Factory:
        def __init__(self):
            self.mishear = {}
            self.engines = []

        def __call__(self, name):
            self.engines.append(NamedAsrEngine(name, self.mishear))
            return self.engines[-1]

    factory = Factory()
    monkeypatch.setattr("pixelbook.mlx_asr.MlxAsrEngine", factory)
    return factory


def _script(repo):
    return str(repo / "books" / "demo" / "ch01" / "ep01" / "script.yaml")


def _locked_speaker(repo):
    lock = repo / "books" / "demo" / "voice.lock"
    return yaml.safe_load(lock.read_text())["speaker"]


def test_voice_uses_the_book_override(repo, engine, asr):
    (repo / "books" / "demo" / "book.yaml").write_text("voice: voices/yujie.yaml\n")

    assert cli.main(["voice", _script(repo)]) == 0

    assert engine.voices == [YUJIE]
    assert _locked_speaker(repo) == "Serena"


def test_voice_refuses_a_changed_voice_until_revoice(repo, engine, asr, capsys):
    assert cli.main(["voice", _script(repo)]) == 0
    (repo / "books" / "demo" / "book.yaml").write_text("voice: voices/yujie.yaml\n")

    assert cli.main(["voice", _script(repo)]) == 1
    assert "--revoice" in capsys.readouterr().out
    assert _locked_speaker(repo) == "Vivian"

    assert cli.main(["voice", _script(repo), "--revoice"]) == 0
    assert _locked_speaker(repo) == "Serena"
    assert engine.voices == [DEFAULT, YUJIE]


def test_term_audition_uses_the_book_voice_without_guard_or_lock(repo, engine):
    (repo / "pronunciation.yaml").write_text("{}\n")
    # 锁定的是另一个音色：试听不受守卫限制，也不改锁定
    lock = repo / "books" / "demo" / "voice.lock"
    lock.write_text("model: base-model\nspeaker: Ryan\n")
    (repo / "books" / "demo" / "book.yaml").write_text("voice: voices/yujie.yaml\n")

    assert cli.main(["terms", _script(repo), "--out", str(repo / "terms")]) == 0

    assert engine.texts == ["DRY"]
    assert engine.voices == [YUJIE]
    assert lock.read_text() == "model: base-model\nspeaker: Ryan\n"


def test_voice_verifies_with_the_configured_asr_and_retries(repo, engine, asr, capsys):
    asr.mishear = {"今天读一本 D R Y 的书": ["今天读一本书"] * 2}

    assert cli.main(["voice", _script(repo)]) == 0

    assert [e.name for e in asr.engines] == ["whisper"]
    # max_retries: 1，一共生成两次
    assert engine.texts == ["今天读一本 D R Y 的书"] * 2
    out = capsys.readouterr().out
    assert "1 句复核未通过" in out
    assert "s01-l01" in out
    assert "今天读一本书" in out


def test_voice_with_a_bad_verification_config_names_the_field(
    repo, engine, asr, capsys
):
    (repo / "verification.yaml").write_text("asr: whisper\nmax_diff_rate: 0.1\n")

    assert cli.main(["voice", _script(repo)]) == 1

    assert "`max_retries`" in capsys.readouterr().out
    assert engine.texts == []
