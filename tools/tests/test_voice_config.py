import pytest

from pixelbook.voice import (
    Voice,
    VoiceConfigError,
    load_voice_config,
    save_voice_config,
)


def test_cloned_voice_round_trips(tmp_path):
    voice = Voice(
        model="mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16",
        ref_audio="voices/narrator.wav",
        ref_text="你好，欢迎来到这期节目。",
        params={"language": "chinese", "temperature": 0.9},
    )
    path = tmp_path / "voice.yaml"

    save_voice_config(voice, path)

    assert load_voice_config(path) == voice


@pytest.mark.parametrize(
    ("content", "field"),
    [
        ("speaker: Vivian\n", "model"),
        ("model: m\n", "speaker"),
        ("model: m\nref_audio: voices/a.wav\n", "ref_text"),
        ("model: m\nspeaker: Vivian\nref_audio: a.wav\nref_text: 你好\n", "speaker"),
        ("model: m\ninstruct: 低沉的男声\n", "instruct"),
        ("model: m\nspeaker: Vivian\nvoice: x\n", "voice"),
        (
            "model: m\nspeaker: Vivian\nparams:\n  temprature: 0.9\n",
            "params.temprature",
        ),
    ],
)
def test_invalid_config_names_the_field(tmp_path, content, field):
    path = tmp_path / "voice.yaml"
    path.write_text(content)

    with pytest.raises(VoiceConfigError) as error:
        load_voice_config(path)

    assert str(path) in str(error.value)
    assert f"`{field}`" in str(error.value)
