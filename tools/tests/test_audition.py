import json

import pytest

from pixelbook.audition import BASE_MODEL, AuditionError, choose_voice, run_audition
from pixelbook.tts import FakeTtsEngine
from pixelbook.voice import Voice, load_voice_config

PLAN = """\
lines:
  - 这条原则叫 DRY。
  - 正交性让模块互不影响。
reference_text: 今天我们一起读一本书。
params:
  language: chinese
candidates:
  - name: vivian
    model: custom-voice-model
    speaker: Vivian
  - name: calm-male
    model: voice-design-model
    instruct: 沉稳的中年男声，语速适中。
"""


@pytest.fixture
def plan_path(tmp_path):
    path = tmp_path / "audition.yaml"
    path.write_text(PLAN)
    return path


def test_each_candidate_reads_every_line_into_a_file_named_after_it(
    tmp_path, plan_path
):
    out = tmp_path / "out"

    run_audition(plan_path, FakeTtsEngine(), out)

    wavs = sorted(p.name for p in out.glob("*.wav"))
    assert wavs == [
        "calm-male-1.wav",
        "calm-male-2.wav",
        "calm-male-ref.wav",
        "vivian-1.wav",
        "vivian-2.wav",
    ]


def test_report_records_per_line_cost_and_estimates_an_episode(tmp_path, plan_path):
    out = tmp_path / "out"

    run_audition(plan_path, FakeTtsEngine(), out)

    report = json.loads((out / "report.json").read_text())
    vivian, calm_male = report["candidates"]
    assert vivian["name"] == "vivian"
    assert vivian["lines"][0] == {
        "file": "vivian-1.wav",
        "text": "这条原则叫 DRY。",
        "elapsed_seconds": pytest.approx(1.0),
        "audio_seconds": pytest.approx(2.0),
        "peak_memory_bytes": 6 * 1024**3,
    }
    assert vivian["lines"][1]["elapsed_seconds"] == pytest.approx(1.1)
    assert vivian["estimated_seconds_per_100_lines"] == pytest.approx(105.0)
    assert "reference" not in vivian
    assert calm_male["reference"]["file"] == "calm-male-ref.wav"
    assert calm_male["estimated_seconds_per_100_lines"] == pytest.approx(105.0)


def test_choosing_a_designed_voice_saves_it_as_a_cloning_reference(tmp_path, plan_path):
    out, repo = tmp_path / "out", tmp_path / "repo"
    run_audition(plan_path, FakeTtsEngine(), out)

    choose_voice(out, "calm-male", repo)

    assert load_voice_config(repo / "voice.yaml") == Voice(
        model=BASE_MODEL,
        ref_audio="voices/calm-male.wav",
        ref_text="今天我们一起读一本书。",
        params={"language": "chinese"},
    )
    reference = (out / "calm-male-ref.wav").read_bytes()
    assert (repo / "voices" / "calm-male.wav").read_bytes() == reference


def test_choosing_a_preset_voice_records_model_and_speaker(tmp_path, plan_path):
    out, repo = tmp_path / "out", tmp_path / "repo"
    run_audition(plan_path, FakeTtsEngine(), out)

    choose_voice(out, "vivian", repo)

    assert load_voice_config(repo / "voice.yaml") == Voice(
        model="custom-voice-model",
        speaker="Vivian",
        params={"language": "chinese"},
    )
    assert not (repo / "voices").exists()


def test_choosing_an_unknown_candidate_lists_the_auditioned_ones(tmp_path, plan_path):
    out, repo = tmp_path / "out", tmp_path / "repo"
    run_audition(plan_path, FakeTtsEngine(), out)

    with pytest.raises(AuditionError, match="vivian.*calm-male"):
        choose_voice(out, "serena", repo)
    assert not (repo / "voice.yaml").exists()


def test_choosing_before_any_audition_says_to_run_one_first(tmp_path):
    with pytest.raises(AuditionError, match="audition"):
        choose_voice(tmp_path / "out", "vivian", tmp_path / "repo")


def test_a_misspelt_generation_param_stops_the_audition_before_any_audio(tmp_path):
    plan_path = tmp_path / "audition.yaml"
    plan_path.write_text(PLAN.replace("language: chinese", "temprature: 0.9"))
    out = tmp_path / "out"

    with pytest.raises(AuditionError, match="`params.temprature`"):
        run_audition(plan_path, FakeTtsEngine(), out)
    assert not list(out.glob("*.wav"))
