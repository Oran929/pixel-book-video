"""试听拼接：按 TS 导出的 timeline.json 把每句 wav 放到开始帧对应的时间点（票 12）。

timeline.json 在这里手写（帧数按 30fps 手算），wav 由假 TTS 引擎生成。
"""

import array
import json
import wave

import pytest

from pixelbook.audio import wav_seconds
from pixelbook.mix import MixError, mix_timeline
from pixelbook.tts import FakeTtsEngine
from pixelbook.voice import Voice

VOICE = Voice(model="base-model", speaker="Aria")


def fake_wav(public, name, text):
    """假引擎按每字 0.2 秒生成静音 wav，返回以 public 为起点的路径。"""
    path = public / "episode" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    FakeTtsEngine().synthesize(text, VOICE, path)
    return f"episode/{name}"


@pytest.fixture
def public(tmp_path):
    return tmp_path / "public"


def timeline(public):
    # 三句各 1.0 秒（5 个字）= 30 帧；句间 9 帧，第三句换画面 24 帧
    return {
        "fps": 30,
        "totalFrames": 123,
        "lines": [
            {
                "id": "s01-l01",
                "audio": fake_wav(public, "a.wav", "一二三四五"),
                "startFrame": 0,
                "endFrame": 30,
            },
            {
                "id": "s01-l02",
                "audio": fake_wav(public, "b.wav", "一二三四五"),
                "startFrame": 39,
                "endFrame": 69,
            },
            {
                "id": "s01-l03",
                "audio": fake_wav(public, "c.wav", "一二三四五"),
                "startFrame": 93,
                "endFrame": 123,
            },
        ],
    }


def write(tmp_path, data):
    path = tmp_path / "timeline.json"
    path.write_text(json.dumps(data))
    return path


def test_track_lasts_as_long_as_the_timeline(tmp_path, public):
    out = tmp_path / "out" / "mix.wav"

    mix_timeline(write(tmp_path, timeline(public)), public, out)

    assert wav_seconds(out) == pytest.approx(123 / 30, abs=1 / 30)


def tone_wav(public, name, seconds, rate=24_000):
    """一段恒定非零采样的 wav，便于在音轨里找到它从哪里开始。"""
    path = public / "episode" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(b"\xe8\x03" * round(seconds * rate))  # 1000
    return f"episode/{name}"


def samples(path):
    with wave.open(str(path), "rb") as wav:
        return wav.getframerate(), array.array("h", wav.readframes(wav.getnframes()))


def test_each_line_starts_at_its_start_frame_with_silence_between(tmp_path, public):
    data = timeline(public)
    for i, line in enumerate(data["lines"]):
        line["audio"] = tone_wav(public, f"tone{i}.wav", 1.0)
    out = tmp_path / "mix.wav"

    mix_timeline(write(tmp_path, data), public, out)

    rate, track = samples(out)
    assert rate == 24_000
    # 第二句从 39 / 30 = 1.3 秒（第 31200 个采样）开始，第三句从 3.1 秒开始
    assert track[0] != 0 and track[24_000 - 1] != 0
    assert set(track[24_000:31_200]) == {0}
    assert track[31_200] != 0 and track[31_200 + 24_000 - 1] != 0
    assert set(track[31_200 + 24_000 : 74_400]) == {0}
    assert track[74_400] != 0 and track[-1] != 0


def test_track_longer_than_the_timeline_by_more_than_a_frame_is_an_error(
    tmp_path, public
):
    # 最后一句的 wav 是 2 秒，比时间轴给它的 30 帧长：timeline.json 和音频对不上
    data = timeline(public)
    data["lines"][2]["audio"] = fake_wav(public, "long.wav", "一二三四五六七八九十")

    with pytest.raises(MixError, match=r"5\.10 秒.*4\.10 秒"):
        mix_timeline(write(tmp_path, data), public, tmp_path / "mix.wav")


def edited(edit):
    def make(public):
        data = timeline(public)
        edit(data)
        return data

    return make


@pytest.mark.parametrize(
    ("make", "message"),
    [
        (edited(lambda d: d.pop("fps")), r"fps: 缺少"),
        (edited(lambda d: d.update(fps=0)), r"fps: 应为正整数，实际是 0"),
        (edited(lambda d: d.update(totalFrames=12.5)), r"totalFrames: 应为非负整数"),
        (edited(lambda d: d.update(lines=[])), r"lines: 至少要有一句"),
        (
            edited(lambda d: d["lines"][1].pop("startFrame")),
            r"lines\[1\]\.startFrame: 缺少",
        ),
        (
            edited(lambda d: d["lines"][1].update(startFrame=-3)),
            r"lines\[1\]\.startFrame: 应为非负整数，实际是 -3",
        ),
        (
            edited(lambda d: d["lines"][0].update(audio=7)),
            r"lines\[0\]\.audio: 应为字符串",
        ),
        (
            edited(lambda d: d["lines"][2].update(id=None)),
            r"lines\[2\]\.id: 应为字符串",
        ),
        (lambda public: [1, 2], r"应为 JSON 对象"),
    ],
)
def test_malformed_timeline_names_the_field(tmp_path, public, make, message):
    path = write(tmp_path, make(public))

    with pytest.raises(MixError, match=rf"timeline\.json: .*\n.*{message}"):
        mix_timeline(path, public, tmp_path / "mix.wav")


def test_missing_audio_names_the_line(tmp_path, public):
    data = timeline(public)
    data["lines"][1]["audio"] = "episode/gone.wav"

    with pytest.raises(MixError, match=r"s01-l02.*episode/gone\.wav 不存在"):
        mix_timeline(write(tmp_path, data), public, tmp_path / "mix.wav")
