import json
import re
import shutil
import wave
from dataclasses import replace

import pytest

from pixelbook import REPO_ROOT
from pixelbook.pipeline import PipelineError, stage_episode, voice_episode
from pixelbook.pronunciation import load_pronunciation
from pixelbook.script import ScriptError
from pixelbook.tts import FakeTtsEngine
from pixelbook.voice import Voice

VOICE = Voice(
    model="base-model",
    ref_audio="voices/tianmei.wav",
    ref_text="你好。",
    params={"language": "chinese"},
)

SCRIPT = """\
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
          - id: s01-l02
            text: 它讲怎样写好代码
            cite: ch01-¶002
  - id: s02
    title: 原则
    scenes:
      - id: s02-c01
        description: 一个方块
        lines:
          - id: s02-l01
            text: 不要重复
            speech: 不要重复你自己
            cite: ch01-¶003
"""


@pytest.fixture
def script_path(tmp_path):
    path = tmp_path / "books" / "demo" / "ch01" / "ep01" / "script.yaml"
    path.parent.mkdir(parents=True)
    path.write_text(SCRIPT)
    return path


def test_manifest_lists_segments_scenes_and_lines_in_order(tmp_path, script_path):
    voice_episode(script_path, FakeTtsEngine(), VOICE, tmp_path / "public", {})

    manifest = json.loads((script_path.parent / "episode.json").read_text())
    assert manifest["segments"] == [
        {"id": "s01", "title": "开场"},
        {"id": "s02", "title": "原则"},
    ]
    assert manifest["scenes"] == [
        {"id": "s01-c01", "segment": "s01"},
        {"id": "s02-c01", "segment": "s02"},
    ]
    lines = manifest["lines"]
    assert [(line["id"], line["scene"], line["text"]) for line in lines] == [
        ("s01-l01", "s01-c01", "今天读一本书"),
        ("s01-l02", "s01-c01", "它讲怎样写好代码"),
        ("s02-l01", "s02-c01", "不要重复"),
    ]
    # 假引擎每个字 0.2 秒；手写了 speech 的句子按 speech 配音
    assert [line["seconds"] for line in lines] == pytest.approx([1.2, 1.6, 1.4])


def test_public_dir_holds_only_this_episode_and_every_audio_exists(
    tmp_path, script_path
):
    public = tmp_path / "public"
    (public / "episode").mkdir(parents=True)
    (public / "episode" / "s09-l01-deadbeef.wav").write_bytes(b"old")
    (public / "fonts").mkdir()
    (public / "fonts" / "pixel.ttf").write_bytes(b"font")

    manifest = voice_episode(script_path, FakeTtsEngine(), VOICE, public, {})

    audio = [line["audio"] for line in manifest["lines"]]
    assert all(
        re.fullmatch(rf"episode/{line['id']}-[0-9a-f]{{8}}\.wav", line["audio"])
        for line in manifest["lines"]
    )
    staged = sorted(p.relative_to(public).as_posix() for p in public.rglob("*"))
    assert staged == sorted(
        ["episode", "episode/episode.json", *audio, "fonts", "fonts/pixel.ttf"]
    )
    assert json.loads((public / "episode" / "episode.json").read_text()) == manifest
    assert (public / "episode" / "episode.json").read_text() == (
        script_path.parent / "episode.json"
    ).read_text()


def test_audio_file_name_changes_with_its_content(tmp_path, script_path):
    first = voice_episode(script_path, FakeTtsEngine(), VOICE, tmp_path / "public", {})
    script_path.write_text(SCRIPT.replace("今天读一本书", "今天读一本好书"))
    second = voice_episode(script_path, FakeTtsEngine(), VOICE, tmp_path / "public", {})

    assert first["lines"][0]["audio"] != second["lines"][0]["audio"]
    assert first["lines"][1]["audio"] == second["lines"][1]["audio"]


def test_stage_recopies_episode_json_and_leaves_audio_alone(tmp_path, script_path):
    public = tmp_path / "public"
    manifest = voice_episode(script_path, FakeTtsEngine(), VOICE, public, {})
    edited = script_path.parent / "episode.json"
    edited.write_text(edited.read_text().replace("开场", "序章"))

    stage_episode(script_path.parent, public)

    assert (public / "episode" / "episode.json").read_text() == edited.read_text()
    for line in manifest["lines"]:
        assert (public / line["audio"]).is_file()


def test_stage_without_a_manifest_says_to_voice_first(tmp_path):
    with pytest.raises(PipelineError, match="episode.json.*pixelbook voice"):
        stage_episode(tmp_path / "ep01", tmp_path / "public")


def _rejected(script_path, public, text):
    script_path.write_text(text)
    with pytest.raises(ScriptError) as error:
        voice_episode(script_path, FakeTtsEngine(), VOICE, public, {})
    assert not (script_path.parent / "episode.json").exists()
    assert not (public / "episode").exists()
    return str(error.value)


@pytest.mark.parametrize(
    ("old", "new", "where", "field"),
    [
        (
            "id: s01-l02\n",
            "id: s01-l01\n",
            "第 1 段第 1 个画面第 2 句（s01-l01）",
            "id",
        ),
        ("            cite: ch01-¶002\n", "", "（s01-l02）", "cite"),
        ("            text: 它讲怎样写好代码\n", "", "（s01-l02）", "text"),
        ("text: 它讲怎样写好代码", "text: 42", "（s01-l02）", "text"),
        ("cite: ch01-¶002", "cites: ch01-¶002", "（s01-l02）", "cites"),
        ("speech: 不要重复你自己", "speech: ''", "（s02-l01）", "speech"),
        (
            "          - id: s01-l02\n",
            "          - ids: s01-l02\n",
            "第 1 段第 1 个画面第 2 句",
            "id",
        ),
        ("    title: 原则\n", "", "第 2 段（s02）", "title"),
        (
            "        description: 一个方块\n",
            "",
            "第 2 段第 1 个画面（s02-c01）",
            "description",
        ),
        ("id: s02-c01", "id: s01-c01", "第 2 段第 1 个画面（s01-c01）", "id"),
        ("id: s02\n", "id: s01\n", "第 2 段（s01）", "id"),
    ],
)
def test_malformed_script_names_the_line_and_field(
    tmp_path, script_path, old, new, where, field
):
    assert old in SCRIPT
    message = _rejected(script_path, tmp_path / "public", SCRIPT.replace(old, new, 1))

    assert str(script_path) in message
    assert where in message
    assert f"`{field}`" in message


@pytest.mark.parametrize(
    "text",
    [
        "一二三四五六七八九十一二三四五六七八九十",
        "一二三四五 六七八九十 一二三四五六七八九十",
        "用 KV Cache 加速一二三四五六七八九十",
    ],
)
def test_text_up_to_20_characters_not_counting_whitespace_passes(
    tmp_path, script_path, text
):
    script_path.write_text(SCRIPT.replace("今天读一本书", text))

    manifest = voice_episode(
        script_path, FakeTtsEngine(), VOICE, tmp_path / "public", {"KV Cache": "KV"}
    )

    assert manifest["lines"][0]["text"] == text


@pytest.mark.parametrize(
    "text",
    [
        "一二三四五六七八九十一二三四五六七八九十一",
        "用 KV Cache 加速一二三四五六七八九十。",
    ],
)
def test_text_over_20_characters_is_rejected(tmp_path, script_path, text):
    message = _rejected(
        script_path, tmp_path / "public", SCRIPT.replace("今天读一本书", text)
    )

    assert "（s01-l01）" in message
    assert "`text`" in message
    assert "21" in message


def test_sample_book_script_is_valid(tmp_path):
    sample = REPO_ROOT / "books" / "sample" / "ch01" / "ep01" / "script.yaml"
    script_path = tmp_path / "books" / "sample" / "ch01" / "ep01" / "script.yaml"
    script_path.parent.mkdir(parents=True)
    shutil.copyfile(sample, script_path)
    table = load_pronunciation(REPO_ROOT / "pronunciation.yaml")

    # 样例旁白稿在仓库的读音表下没有新术语，能正式配音
    manifest = voice_episode(
        script_path, FakeTtsEngine(), VOICE, tmp_path / "public", table
    )

    assert len(manifest["segments"]) == 2
    assert 6 <= len(manifest["lines"]) <= 8


# ---- 按句配音缓存（票 05） ----


def test_second_run_reuses_every_line_without_calling_tts(tmp_path, script_path):
    public = tmp_path / "public"
    first = voice_episode(script_path, FakeTtsEngine(), VOICE, public, {})

    engine = FakeTtsEngine()
    second = voice_episode(script_path, engine, VOICE, public, {})

    assert engine.texts == []
    assert second == first
    for line in second["lines"]:
        assert (public / line["audio"]).is_file()


def test_editing_one_line_regenerates_only_that_line(tmp_path, script_path):
    voice_episode(script_path, FakeTtsEngine(), VOICE, tmp_path / "public", {})
    script_path.write_text(SCRIPT.replace("它讲怎样写好代码", "它讲怎样写出好代码"))

    engine = FakeTtsEngine()
    voice_episode(script_path, engine, VOICE, tmp_path / "public", {})

    assert engine.texts == ["它讲怎样写出好代码"]


@pytest.mark.parametrize(
    "changed",
    [
        replace(VOICE, params={"language": "chinese", "temperature": 0.7}),
        replace(VOICE, model="another-model"),
        replace(VOICE, ref_text="大家好。"),
    ],
)
def test_changing_voice_settings_regenerates_every_line(tmp_path, script_path, changed):
    voice_episode(script_path, FakeTtsEngine(), VOICE, tmp_path / "public", {})

    engine = FakeTtsEngine()
    voice_episode(script_path, engine, changed, tmp_path / "public", {})

    assert len(engine.texts) == 3


def test_changing_engine_settings_regenerates_every_line(tmp_path, script_path):
    voice_episode(script_path, FakeTtsEngine(), VOICE, tmp_path / "public", {})

    # 例如真实引擎给参考音频补的静音（REF_PAD_SECONDS）改了
    engine = FakeTtsEngine(settings={"engine": "fake", "ref_pad_seconds": [0.3, 0.6]})
    voice_episode(script_path, engine, VOICE, tmp_path / "public", {})

    assert len(engine.texts) == 3


def test_random_seed_is_not_part_of_the_cache_key(tmp_path, script_path):
    voice_episode(script_path, FakeTtsEngine(), VOICE, tmp_path / "public", {})

    # 07 重试时会换种子，通过的那一版仍然存在同一个指纹下
    engine = FakeTtsEngine()
    reseeded = replace(VOICE, params={**VOICE.params, "seed": 42})
    voice_episode(script_path, engine, reseeded, tmp_path / "public", {})

    assert engine.texts == []


def _write_wav(path, seconds):
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24_000)
        wav.writeframes(b"\x00\x00" * round(seconds * 24_000))


def test_new_reference_audio_content_at_the_same_path_regenerates_every_line(
    tmp_path, script_path
):
    ref = tmp_path / "ref.wav"
    _write_wav(ref, 1.0)
    # 绝对路径接在仓库根目录后面仍是它自己，测试里用临时文件当参考音频
    voice = replace(VOICE, ref_audio=str(ref))
    voice_episode(script_path, FakeTtsEngine(), voice, tmp_path / "public", {})

    _write_wav(ref, 2.0)
    engine = FakeTtsEngine()
    voice_episode(script_path, engine, voice, tmp_path / "public", {})

    assert len(engine.texts) == 3


def test_missing_reference_audio_is_rejected_before_any_voicing(tmp_path, script_path):
    voice = replace(VOICE, ref_audio=str(tmp_path / "missing.wav"))
    engine = FakeTtsEngine()

    with pytest.raises(PipelineError, match="missing.wav"):
        voice_episode(script_path, engine, voice, tmp_path / "public", {})
    assert engine.texts == []


def test_deleting_the_cache_rebuilds_every_line(tmp_path, script_path):
    public = tmp_path / "public"
    first = voice_episode(script_path, FakeTtsEngine(), VOICE, public, {})
    shutil.rmtree(tmp_path / "books" / "demo" / "cache")

    engine = FakeTtsEngine()
    second = voice_episode(script_path, engine, VOICE, public, {})

    assert len(engine.texts) == 3
    assert second == first
    for line in second["lines"]:
        assert (public / line["audio"]).is_file()


def test_each_cached_wav_has_a_same_named_json_with_generation_info(
    tmp_path, script_path
):
    voice_episode(script_path, FakeTtsEngine(), VOICE, tmp_path / "public", {})

    cache = tmp_path / "books" / "demo" / "cache" / "tts"
    wavs = sorted(p.stem for p in cache.glob("*.wav"))
    infos = {p.stem: json.loads(p.read_text()) for p in cache.glob("*.json")}
    assert sorted(infos) == wavs
    assert all(re.fullmatch(r"[0-9a-f]{16}", stem) for stem in wavs)
    assert sorted(info["text"] for info in infos.values()) == sorted(
        ["今天读一本书", "它讲怎样写好代码", "不要重复你自己"]
    )
    for info in infos.values():
        assert info["voice"]["model"] == "base-model"
        assert info["engine"] == {"engine": "fake"}
        # 假引擎每个字 0.1 秒
        assert info["elapsed_seconds"] == pytest.approx(len(info["text"]) * 0.1)


class InterruptedEngine(FakeTtsEngine):
    """写到一半就中断（例如按了 Ctrl-C），留下半个文件。"""

    def __init__(self, fail_on):
        super().__init__()
        self.fail_on = fail_on

    def synthesize(self, text, voice, out):
        if text == self.fail_on:
            out.write_bytes(b"RIFF half a wav")
            raise KeyboardInterrupt
        return super().synthesize(text, voice, out)


def test_interrupted_generation_leaves_no_broken_cache_file(tmp_path, script_path):
    with pytest.raises(KeyboardInterrupt):
        voice_episode(
            script_path,
            InterruptedEngine(fail_on="它讲怎样写好代码"),
            VOICE,
            tmp_path / "public",
            {},
        )

    cache = tmp_path / "books" / "demo" / "cache" / "tts"
    # 只剩中断之前已经完整生成的第一句
    assert sorted(p.suffix for p in cache.iterdir()) == [".json", ".wav"]

    engine = FakeTtsEngine()
    voice_episode(script_path, engine, VOICE, tmp_path / "public", {})
    assert engine.texts == ["它讲怎样写好代码", "不要重复你自己"]


def test_manifest_records_the_voice_fingerprint_used(tmp_path, script_path):
    public = tmp_path / "public"
    first = voice_episode(script_path, FakeTtsEngine(), VOICE, public, {})
    reseeded = replace(VOICE, params={**VOICE.params, "seed": 7})
    same = voice_episode(script_path, FakeTtsEngine(), reseeded, public, {})
    other = voice_episode(
        script_path, FakeTtsEngine(), replace(VOICE, model="other"), public, {}
    )

    assert re.fullmatch(r"[0-9a-f]{16}", first["voice_fingerprint"])
    assert same["voice_fingerprint"] == first["voice_fingerprint"]
    assert other["voice_fingerprint"] != first["voice_fingerprint"]
    # 和每句缓存旁边 json 里记的是同一个值
    cache = tmp_path / "books" / "demo" / "cache" / "tts"
    recorded = {
        json.loads(p.read_text())["voice_fingerprint"] for p in cache.glob("*.json")
    }
    assert recorded == {first["voice_fingerprint"], other["voice_fingerprint"]}
