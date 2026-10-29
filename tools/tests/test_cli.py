"""命令行：`voice` 和 `terms` 用书解析出的音色（票 06）。

真实 TTS 引擎换成记录音色的假引擎，仓库根目录换成临时目录。
"""

import json
import shutil

import pytest
import yaml
from conftest import OUTRO

from pixelbook import REPO_ROOT, cli
from pixelbook.asr import FakeAsrEngine
from pixelbook.audio import wav_seconds
from pixelbook.pipeline import SUBTITLE_FONT
from pixelbook.tts import FakeTtsEngine
from pixelbook.voice import Voice, save_voice_config

DEFAULT = Voice(model="base-model", speaker="Vivian")
YUJIE = Voice(model="base-model", speaker="Serena")

# 一句、带读音表里的术语 DRY：命令行的测试数一数引擎调用、看朗读文本，一句最清楚
DRY_SCRIPT = """\
title: 示例书
status: final
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
def repo(tmp_path, script_path, monkeypatch):
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
    font = tmp_path / "public" / SUBTITLE_FONT
    font.parent.mkdir(parents=True)
    shutil.copyfile(REPO_ROOT / "video" / "public" / SUBTITLE_FONT, font)
    script_path.write_text(DRY_SCRIPT)
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

    # 每句（包括片尾的三句）用一次音色
    assert engine.voices == [YUJIE] * 4
    assert _locked_speaker(repo) == "Serena"


def test_voice_refuses_a_changed_voice_until_revoice(repo, engine, asr, capsys):
    assert cli.main(["voice", _script(repo)]) == 0
    (repo / "books" / "demo" / "book.yaml").write_text("voice: voices/yujie.yaml\n")

    assert cli.main(["voice", _script(repo)]) == 1
    assert "--revoice" in capsys.readouterr().out
    assert _locked_speaker(repo) == "Vivian"

    assert cli.main(["voice", _script(repo), "--revoice"]) == 0
    assert _locked_speaker(repo) == "Serena"
    assert engine.voices == [DEFAULT] * 4 + [YUJIE] * 4


def _mark_draft(repo):
    path = repo / "books" / "demo" / "ch01" / "ep01" / "script.yaml"
    path.write_text(DRY_SCRIPT.replace("status: final", "status: draft"))


def test_voice_refuses_a_draft_script(repo, engine, asr, capsys):
    _mark_draft(repo)

    assert cli.main(["voice", _script(repo)]) == 1

    out = capsys.readouterr().out
    assert "status: draft" in out and "--draft" in out
    assert engine.voices == []
    assert not (repo / "books" / "demo" / "voice.lock").exists()


def test_voice_with_draft_voices_a_draft_script(repo, engine, asr):
    _mark_draft(repo)

    assert cli.main(["voice", _script(repo), "--draft"]) == 0

    assert engine.voices == [DEFAULT] * 4


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
    assert engine.texts == ["今天读一本 D R Y 的书"] * 2 + OUTRO
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


def test_voice_lists_lines_that_passed_only_on_pinyin(repo, engine, asr, capsys):
    asr.mishear = {"今天读一本 D R Y 的书": ["今天读一本 D R Y 得输"]}

    assert cli.main(["voice", _script(repo)]) == 0

    assert engine.texts == ["今天读一本 D R Y 的书", *OUTRO]
    out = capsys.readouterr().out
    assert "复核未通过" not in out
    assert "1 句靠拼音通过" in out
    assert "今天读一本 D R Y 得输" in out
    # 规范化后 10 个字错 2 个，拼音全对
    assert "字符差异率 20%" in out
    assert "拼音差异率 0%" in out


def test_mix_writes_the_audition_track_under_out(repo, engine, asr, capsys):
    assert cli.main(["voice", _script(repo)]) == 0
    episode = repo / "books" / "demo" / "ch01" / "ep01"
    manifest = json.loads((episode / "episode.json").read_text())
    # 一句：朗读文本"今天读一本 D R Y 的书"15 个字，假引擎 3 秒 = 90 帧
    (episode / "timeline.json").write_text(
        json.dumps(
            {
                "fps": 30,
                "totalFrames": 90,
                "lines": [
                    {
                        "id": "s01-l01",
                        "audio": manifest["lines"][0]["audio"],
                        "startFrame": 0,
                    }
                ],
            }
        )
    )

    assert cli.main(["mix", str(episode / "timeline.json")]) == 0

    out = repo / "out" / "mix" / "demo-ch01-ep01.wav"
    assert wav_seconds(out) == pytest.approx(3.0)
    assert str(out) in capsys.readouterr().out


def test_mix_reports_a_malformed_timeline(repo, capsys):
    timeline = repo / "books" / "demo" / "ch01" / "ep01" / "timeline.json"
    timeline.write_text('{"fps": 30, "lines": []}')

    assert cli.main(["mix", str(timeline)]) == 1
    assert "totalFrames: 缺少" in capsys.readouterr().out


def test_voice_fails_naming_each_line_and_character_missing_from_the_font(
    repo, engine, asr, capsys
):
    script = repo / "books" / "demo" / "ch01" / "ep01" / "script.yaml"
    script.write_text(DRY_SCRIPT.replace("今天读一本 DRY 的书", "今天读一本 DRY 的𠀀"))

    assert cli.main(["voice", str(script)]) == 1

    out = capsys.readouterr().out
    assert "s01-l01" in out and "𠀀" in out
    report = json.loads((script.parent / "report.json").read_text())
    assert report["missing_glyphs"] == [{"id": "s01-l01", "char": "𠀀"}]
    # 配音前就拒绝：不配音，不写合成清单
    assert not (script.parent / "episode.json").exists()


BAD_STORYBOARD = {
    "scenes": [],
    "pauses": [{"after": "s09-l09", "seconds": 1}],
}


def test_render_reports_a_bad_config_as_the_voicing_step(repo, engine, asr, capsys):
    (repo / "verification.yaml").write_text("asr: whisper\nmax_diff_rate: 0.1\n")

    assert cli.main(["render", _script(repo)]) == 1

    out = capsys.readouterr().out
    assert "第 1 步「配音」失败" in out
    assert "`max_retries`" in out


def test_render_passes_revoice_through_and_stops_at_the_failing_step(
    repo, engine, asr, capsys
):
    # 分镜不合格：配音一步成功后在时间轴一步停下，不进入（慢的）渲染
    episode = repo / "books" / "demo" / "ch01" / "ep01"
    (episode / "storyboard.json").write_text(json.dumps(BAD_STORYBOARD))
    assert cli.main(["render", _script(repo)]) == 1
    assert "第 2 步「时间轴」失败" in capsys.readouterr().out
    (repo / "books" / "demo" / "book.yaml").write_text("voice: voices/yujie.yaml\n")

    assert cli.main(["render", _script(repo)]) == 1
    out = capsys.readouterr().out
    assert "第 1 步「配音」失败" in out and "--revoice" in out

    assert cli.main(["render", _script(repo), "--revoice"]) == 1
    out = capsys.readouterr().out
    assert "第 2 步「时间轴」失败" in out and "s09-l09" in out
    assert _locked_speaker(repo) == "Serena"
    assert not (repo / "out" / "demo-ch01-ep01.mp4").exists()


def test_render_refuses_a_draft_script_at_the_voicing_step(repo, engine, asr, capsys):
    _mark_draft(repo)

    assert cli.main(["render", _script(repo)]) == 1

    out = capsys.readouterr().out
    assert "第 1 步「配音」失败" in out and "--draft" in out
    assert engine.voices == []


def test_render_passes_draft_through_to_the_voicing_step(repo, engine, asr, capsys):
    # 分镜不合格：配音一步通过后在时间轴一步停下，不进入（慢的）渲染
    _mark_draft(repo)
    episode = repo / "books" / "demo" / "ch01" / "ep01"
    (episode / "storyboard.json").write_text(json.dumps(BAD_STORYBOARD))

    assert cli.main(["render", _script(repo), "--draft"]) == 1

    assert "第 2 步「时间轴」失败" in capsys.readouterr().out
    assert engine.voices == [DEFAULT] * 4


def test_mix_without_out_refuses_a_timeline_outside_an_episode_dir(repo, capsys):
    (repo / "timeline.json").write_text('{"fps": 30, "lines": []}')

    assert cli.main(["mix", str(repo / "timeline.json")]) == 1
    assert "books/<书>/<章>/<期>/" in capsys.readouterr().out
