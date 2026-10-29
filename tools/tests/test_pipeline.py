import hashlib
import json
import re
import shutil
import wave
from dataclasses import replace

import pytest
import yaml
from conftest import OUTRO, SCRIPT, VOICE, fake_asr_verifier

from pixelbook import REPO_ROOT
from pixelbook.asr import FakeAsrEngine
from pixelbook.pipeline import (
    SUBTITLE_FONT,
    PipelineError,
    stage_episode,
    voice_episode,
)
from pixelbook.pronunciation import load_pronunciation
from pixelbook.script import ScriptError
from pixelbook.tts import FakeTtsEngine
from pixelbook.verification import Verifier


def test_manifest_lists_segments_scenes_and_lines_in_order(tmp_path, script_path):
    voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    manifest = json.loads((script_path.parent / "episode.json").read_text())
    assert manifest["title"] == "程序员修炼之道"
    # 旁白稿之后是固定片尾：保留的段、画面和旁白句 ID（票 #15）
    assert manifest["segments"] == [
        {"id": "s01", "title": "开场"},
        {"id": "s02", "title": "原则"},
        {"id": "outro", "title": "片尾"},
    ]
    assert manifest["scenes"] == [
        {"id": "s01-c01", "segment": "s01"},
        {"id": "s02-c01", "segment": "s02"},
        {"id": "outro-c01", "segment": "outro"},
    ]
    lines = manifest["lines"]
    assert [(line["id"], line["scene"], line["text"]) for line in lines] == [
        ("s01-l01", "s01-c01", "今天读一本书"),
        ("s01-l02", "s01-c01", "它讲怎样写好代码"),
        ("s02-l01", "s02-c01", "不要重复"),
        ("outro-l01", "outro-c01", "本期先讲到这里，"),
        ("outro-l02", "outro-c01", "欢迎大家阅读原著了解更原汁原味的内容，"),
        ("outro-l03", "outro-c01", "我们下一期见"),
    ]
    # 假引擎每个字 0.2 秒；手写了 speech 的句子按 speech 配音
    assert [line["seconds"] for line in lines[:3]] == pytest.approx([1.2, 1.6, 1.4])


def test_the_outro_is_the_users_wording_split_into_subtitles(tmp_path, script_path):
    manifest = voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    outro = [line["text"] for line in manifest["lines"] if line["scene"] == "outro-c01"]
    # 措辞是用户定的，只在自然停顿处断开，一个字不改
    assert "".join(outro) == (
        "本期先讲到这里，欢迎大家阅读原著了解更原汁原味的内容，我们下一期见"
    )
    assert all(len(text) <= 20 for text in outro)


def test_the_outro_is_voiced_and_verified_like_any_line(tmp_path, script_path):
    # 识别把片尾第三句听错：重试用完仍不通过，照常列进检查报告
    asr = FakeAsrEngine(mishear={"我们下一期见": ["我们下一集见了"]})
    engine = FakeTtsEngine()

    voice_episode(
        script_path,
        engine,
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(asr, max_retries=0),
    )

    assert engine.texts[-3:] == [
        "本期先讲到这里，",
        "欢迎大家阅读原著了解更原汁原味的内容，",
        "我们下一期见",
    ]
    assert [item["id"] for item in _report(script_path)["asr_failures"]] == [
        "outro-l03"
    ]
    # 缓存在书的目录下，和正文共用
    voice_episode(
        script_path,
        (again := FakeTtsEngine()),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(asr, max_retries=0),
    )
    assert again.texts == []


def test_a_script_id_taken_by_the_outro_is_refused(tmp_path, script_path):
    script_path.write_text(SCRIPT.replace("id: s02\n", "id: outro\n"))

    with pytest.raises(PipelineError, match="outro"):
        voice_episode(
            script_path,
            FakeTtsEngine(),
            VOICE,
            tmp_path / "public",
            {},
            verifier=fake_asr_verifier(),
        )


def test_public_dir_holds_only_this_episode_and_every_audio_exists(
    tmp_path, script_path
):
    public = tmp_path / "public"
    (public / "episode").mkdir(parents=True)
    (public / "episode" / "s09-l01-deadbeef.wav").write_bytes(b"old")
    (public / "fonts").mkdir()
    (public / "fonts" / "pixel.ttf").write_bytes(b"font")

    manifest = voice_episode(
        script_path, FakeTtsEngine(), VOICE, public, {}, verifier=fake_asr_verifier()
    )

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
    first = voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )
    script_path.write_text(SCRIPT.replace("今天读一本书", "今天读一本好书"))
    second = voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    assert first["lines"][0]["audio"] != second["lines"][0]["audio"]
    assert first["lines"][1]["audio"] == second["lines"][1]["audio"]


def test_stage_recopies_episode_json_and_leaves_audio_alone(tmp_path, script_path):
    public = tmp_path / "public"
    manifest = voice_episode(
        script_path, FakeTtsEngine(), VOICE, public, {}, verifier=fake_asr_verifier()
    )
    edited = script_path.parent / "episode.json"
    edited.write_text(edited.read_text().replace("开场", "序章"))

    stage_episode(script_path.parent, public)

    assert (public / "episode" / "episode.json").read_text() == edited.read_text()
    for line in manifest["lines"]:
        assert (public / line["audio"]).is_file()


def test_stage_copies_the_storyboard_when_the_episode_has_one(tmp_path, script_path):
    public = tmp_path / "public"
    voice_episode(
        script_path, FakeTtsEngine(), VOICE, public, {}, verifier=fake_asr_verifier()
    )
    storyboard = script_path.parent / "storyboard.json"
    storyboard.write_text('{"scenes": []}')

    stage_episode(script_path.parent, public)

    assert (public / "episode" / "storyboard.json").read_text() == '{"scenes": []}'


def test_stage_drops_a_stale_storyboard_when_the_episode_has_none(
    tmp_path, script_path
):
    public = tmp_path / "public"
    voice_episode(
        script_path, FakeTtsEngine(), VOICE, public, {}, verifier=fake_asr_verifier()
    )
    (public / "episode" / "storyboard.json").write_text('{"scenes": []}')

    stage_episode(script_path.parent, public)

    assert not (public / "episode" / "storyboard.json").exists()
    assert (public / "episode" / "episode.json").is_file()


def test_stage_without_a_manifest_says_to_voice_first(tmp_path):
    with pytest.raises(PipelineError, match="episode.json.*pixelbook voice"):
        stage_episode(tmp_path / "ep01", tmp_path / "public")


def _rejected(script_path, public, text):
    script_path.write_text(text)
    with pytest.raises(ScriptError) as error:
        voice_episode(
            script_path,
            FakeTtsEngine(),
            VOICE,
            public,
            {},
            verifier=fake_asr_verifier(),
        )
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
        ("title: 程序员修炼之道\n", "", "旁白稿", "title"),
        ("title: 程序员修炼之道", "title: ''", "旁白稿", "title"),
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
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {"KV Cache": "KV"},
        verifier=fake_asr_verifier(),
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
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        table,
        verifier=fake_asr_verifier(),
    )

    # 正文两段，加上片尾
    assert len(manifest["segments"]) == 3
    assert 6 + len(OUTRO) <= len(manifest["lines"]) <= 8 + len(OUTRO)


# ---- 按句配音缓存（票 05） ----


def test_second_run_reuses_every_line_without_calling_tts(tmp_path, script_path):
    public = tmp_path / "public"
    first = voice_episode(
        script_path, FakeTtsEngine(), VOICE, public, {}, verifier=fake_asr_verifier()
    )

    engine = FakeTtsEngine()
    second = voice_episode(
        script_path, engine, VOICE, public, {}, verifier=fake_asr_verifier()
    )

    assert engine.texts == []
    assert second == first
    for line in second["lines"]:
        assert (public / line["audio"]).is_file()


def test_editing_one_line_regenerates_only_that_line(tmp_path, script_path):
    voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )
    script_path.write_text(SCRIPT.replace("它讲怎样写好代码", "它讲怎样写出好代码"))

    engine = FakeTtsEngine()
    voice_episode(
        script_path,
        engine,
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

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
    voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    engine = FakeTtsEngine()
    voice_episode(
        script_path,
        engine,
        changed,
        tmp_path / "public",
        {},
        revoice=True,
        verifier=fake_asr_verifier(),
    )

    assert len(engine.texts) == 3 + len(OUTRO)


def test_changing_engine_settings_regenerates_every_line(tmp_path, script_path):
    voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    # 例如真实引擎给参考音频补的静音（REF_PAD_SECONDS）改了。引擎设置不进
    # 锁定音色，守卫不拦（票 06）；只是缓存键变了
    engine = FakeTtsEngine(settings={"engine": "fake", "ref_pad_seconds": [0.3, 0.6]})
    voice_episode(
        script_path,
        engine,
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    assert len(engine.texts) == 3 + len(OUTRO)


def test_random_seed_is_not_part_of_the_cache_key(tmp_path, script_path):
    voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    # 07 重试时会换种子，通过的那一版仍然存在同一个指纹下
    engine = FakeTtsEngine()
    reseeded = replace(VOICE, params={**VOICE.params, "seed": 42})
    voice_episode(
        script_path,
        engine,
        reseeded,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

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
    voice_episode(
        script_path,
        FakeTtsEngine(),
        voice,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    _write_wav(ref, 2.0)
    engine = FakeTtsEngine()
    voice_episode(
        script_path,
        engine,
        voice,
        tmp_path / "public",
        {},
        revoice=True,
        verifier=fake_asr_verifier(),
    )

    assert len(engine.texts) == 3 + len(OUTRO)


def test_missing_reference_audio_is_rejected_before_any_voicing(tmp_path, script_path):
    voice = replace(VOICE, ref_audio=str(tmp_path / "missing.wav"))
    engine = FakeTtsEngine()

    with pytest.raises(PipelineError, match="missing.wav"):
        voice_episode(
            script_path,
            engine,
            voice,
            tmp_path / "public",
            {},
            verifier=fake_asr_verifier(),
        )
    assert engine.texts == []


def test_deleting_the_cache_rebuilds_every_line(tmp_path, script_path):
    public = tmp_path / "public"
    first = voice_episode(
        script_path, FakeTtsEngine(), VOICE, public, {}, verifier=fake_asr_verifier()
    )
    shutil.rmtree(tmp_path / "books" / "demo" / "cache")

    engine = FakeTtsEngine()
    second = voice_episode(
        script_path, engine, VOICE, public, {}, verifier=fake_asr_verifier()
    )

    assert len(engine.texts) == 3 + len(OUTRO)
    assert second == first
    for line in second["lines"]:
        assert (public / line["audio"]).is_file()


def test_each_cached_wav_has_a_same_named_json_with_generation_info(
    tmp_path, script_path
):
    voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    cache = tmp_path / "books" / "demo" / "cache" / "tts"
    wavs = sorted(p.stem for p in cache.glob("*.wav"))
    infos = {p.stem: json.loads(p.read_text()) for p in cache.glob("*.json")}
    assert sorted(infos) == wavs
    assert all(re.fullmatch(r"[0-9a-f]{16}", stem) for stem in wavs)
    assert sorted(info["text"] for info in infos.values()) == sorted(
        ["今天读一本书", "它讲怎样写好代码", "不要重复你自己", *OUTRO]
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
            verifier=fake_asr_verifier(),
        )

    cache = tmp_path / "books" / "demo" / "cache" / "tts"
    # 只剩中断之前已经完整生成的第一句
    assert sorted(p.suffix for p in cache.iterdir()) == [".json", ".wav"]

    engine = FakeTtsEngine()
    voice_episode(
        script_path,
        engine,
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )
    assert engine.texts == ["它讲怎样写好代码", "不要重复你自己", *OUTRO]


def test_manifest_records_the_voice_fingerprint_used(tmp_path, script_path):
    public = tmp_path / "public"
    first = voice_episode(
        script_path, FakeTtsEngine(), VOICE, public, {}, verifier=fake_asr_verifier()
    )
    reseeded = replace(VOICE, params={**VOICE.params, "seed": 7})
    same = voice_episode(
        script_path, FakeTtsEngine(), reseeded, public, {}, verifier=fake_asr_verifier()
    )
    other = voice_episode(
        script_path,
        FakeTtsEngine(),
        replace(VOICE, model="other"),
        public,
        {},
        revoice=True,
        verifier=fake_asr_verifier(),
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


# ---- 音色锁定与守卫（票 06） ----


def _lock(script_path):
    return script_path.parents[2] / "voice.lock"


def test_first_voicing_locks_the_full_voice_settings_and_reference_audio_content(
    tmp_path, script_path
):
    voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    content = (REPO_ROOT / "voices" / "tianmei.wav").read_bytes()
    assert yaml.safe_load(_lock(script_path).read_text()) == {
        "model": "base-model",
        "ref_audio": "voices/tianmei.wav",
        "ref_audio_sha256": hashlib.sha256(content).hexdigest(),
        "ref_text": "你好。",
        "params": {"language": "chinese"},
    }


def test_voice_differing_from_the_lock_is_refused_listing_locked_and_current(
    tmp_path, script_path
):
    public = tmp_path / "public"
    voice_episode(
        script_path, FakeTtsEngine(), VOICE, public, {}, verifier=fake_asr_verifier()
    )
    locked = _lock(script_path).read_text()
    changed = replace(VOICE, ref_text="大家好。")

    engine = FakeTtsEngine()
    with pytest.raises(PipelineError) as error:
        voice_episode(
            script_path, engine, changed, public, {}, verifier=fake_asr_verifier()
        )

    message = str(error.value)
    assert "ref_text" in message
    assert "你好。" in message and "大家好。" in message
    assert "--revoice" in message
    assert engine.texts == []
    assert _lock(script_path).read_text() == locked


def test_revoice_updates_the_lock_and_regenerates_every_line(tmp_path, script_path):
    public = tmp_path / "public"
    voice_episode(
        script_path, FakeTtsEngine(), VOICE, public, {}, verifier=fake_asr_verifier()
    )
    changed = replace(VOICE, ref_text="大家好。")

    engine = FakeTtsEngine()
    voice_episode(
        script_path,
        engine,
        changed,
        public,
        {},
        revoice=True,
        verifier=fake_asr_verifier(),
    )

    assert engine.texts == [
        "今天读一本书",
        "它讲怎样写好代码",
        "不要重复你自己",
        *OUTRO,
    ]
    assert yaml.safe_load(_lock(script_path).read_text())["ref_text"] == "大家好。"
    # 锁定已更新：之后不加 --revoice 也能用新音色配音
    voice_episode(
        script_path, FakeTtsEngine(), changed, public, {}, verifier=fake_asr_verifier()
    )


def test_new_reference_audio_content_at_the_same_path_is_refused(tmp_path, script_path):
    ref = tmp_path / "ref.wav"
    _write_wav(ref, 1.0)
    voice = replace(VOICE, ref_audio=str(ref))
    voice_episode(
        script_path,
        FakeTtsEngine(),
        voice,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    _write_wav(ref, 2.0)
    engine = FakeTtsEngine()
    with pytest.raises(PipelineError, match="ref_audio_sha256"):
        voice_episode(
            script_path,
            engine,
            voice,
            tmp_path / "public",
            {},
            verifier=fake_asr_verifier(),
        )
    assert engine.texts == []


def test_failed_first_voicing_writes_no_lock(tmp_path, script_path):
    script_path.write_text(SCRIPT.replace("今天读一本书", "今天读 DRY"))
    with pytest.raises(PipelineError, match="新术语"):
        voice_episode(
            script_path,
            FakeTtsEngine(),
            VOICE,
            tmp_path / "public",
            {},
            verifier=fake_asr_verifier(),
        )

    script_path.write_text(SCRIPT)
    voice = replace(VOICE, ref_audio=str(tmp_path / "missing.wav"))
    with pytest.raises(PipelineError, match="missing.wav"):
        voice_episode(
            script_path,
            FakeTtsEngine(),
            voice,
            tmp_path / "public",
            {},
            verifier=fake_asr_verifier(),
        )

    assert not _lock(script_path).exists()


# ---- 语音识别复核与重试（票 07） ----


def _report(script_path):
    return json.loads((script_path.parent / "report.json").read_text())


def _cache_records(script_path):
    cache = script_path.parents[2] / "cache" / "tts"
    return {
        info["text"]: info
        for info in (json.loads(p.read_text()) for p in cache.glob("*.json"))
    }


def test_lines_heard_as_spoken_pass_on_the_first_take(tmp_path, script_path):
    engine, asr = FakeTtsEngine(), FakeAsrEngine()

    voice_episode(
        script_path,
        engine,
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(asr),
    )

    assert engine.texts == [
        "今天读一本书",
        "它讲怎样写好代码",
        "不要重复你自己",
        *OUTRO,
    ]
    assert _report(script_path) == {"asr_failures": [], "asr_pinyin_passes": []}
    for text, info in _cache_records(script_path).items():
        assert info["verification"]["passed"] is True
        assert info["verification"]["attempts"] == [
            {
                "heard": text,
                "diff_rate": 0,
                "pinyin_diff_rate": None,
                "passed_by": "chars",
            }
        ]


def test_format_differences_in_what_is_heard_do_not_trigger_a_retry(
    tmp_path, script_path
):
    asr = FakeAsrEngine(mishear={"今天读一本书": ["今天讀1本書。"]})
    engine = FakeTtsEngine()

    voice_episode(
        script_path,
        engine,
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(asr),
    )

    assert engine.texts.count("今天读一本书") == 1
    assert _report(script_path) == {"asr_failures": [], "asr_pinyin_passes": []}


def test_a_misheard_line_is_regenerated_until_it_passes(tmp_path, script_path):
    asr = FakeAsrEngine(mishear={"它讲怎样写好代码": ["它讲怎样写坏代码", "它讲"]})
    engine = FakeTtsEngine()

    voice_episode(
        script_path,
        engine,
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(asr),
    )

    assert engine.texts.count("它讲怎样写好代码") == 3
    assert _report(script_path) == {"asr_failures": [], "asr_pinyin_passes": []}
    verification = _cache_records(script_path)["它讲怎样写好代码"]["verification"]
    assert verification["passed"] is True
    assert [a["heard"] for a in verification["attempts"]] == [
        "它讲怎样写坏代码",
        "它讲",
        "它讲怎样写好代码",
    ]


class RamblingTtsEngine(FakeTtsEngine):
    """每次生成都在句尾多说几个"啊"：第 n 次多说 `extra[n]` 个。

    假识别引擎听见的就是它说的，所以多说得越少，差异率越低；句子也越短。
    """

    def __init__(self, extra):
        super().__init__()
        self.extra = list(extra)

    def synthesize(self, text, voice, out):
        return super().synthesize(text + "啊" * self.extra.pop(0), voice, out)


def test_a_line_failing_every_retry_keeps_its_closest_take_and_is_reported(
    tmp_path, script_path
):
    script_path.write_text(SCRIPT.replace("今天读一本书", "今天读一本好书"))
    # 第一句 7 个字：三次分别多说 3、1、2 个字，第二次最接近（差异率 1/7）
    engine = RamblingTtsEngine([3, 1, 2] + [0] * (2 + len(OUTRO)))

    manifest = voice_episode(
        script_path,
        engine,
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    assert len(engine.texts) == 3 + 2 + len(OUTRO)
    # 缓存、上屏的是第二次生成的那一版：7 + 1 个字，每字 0.2 秒
    assert manifest["lines"][0]["seconds"] == pytest.approx(1.6)
    [failure] = _report(script_path)["asr_failures"]
    cached = failure.pop("cache")
    assert failure == {
        "id": "s01-l01",
        "text": "今天读一本好书",
        "spoken": "今天读一本好书",
        "heard": "今天读一本好书啊",
        "diff_rate": pytest.approx(1 / 7),
        "pinyin_diff_rate": pytest.approx(1 / 7),
    }
    # 想重新生成就删掉这个文件；路径相对书的目录
    assert re.fullmatch(r"cache/tts/[0-9a-f]{16}\.wav", cached)
    assert (script_path.parents[2] / cached).is_file()
    verification = _cache_records(script_path)["今天读一本好书"]["verification"]
    assert verification["passed"] is False
    assert len(verification["attempts"]) == 3


def test_a_line_that_failed_verification_is_reused_and_still_reported(
    tmp_path, script_path
):
    public = tmp_path / "public"
    asr = FakeAsrEngine(mishear={"它讲怎样写好代码": ["它讲怎样写坏代码"] * 3})
    first = voice_episode(
        script_path, FakeTtsEngine(), VOICE, public, {}, verifier=fake_asr_verifier(asr)
    )
    failures = _report(script_path)["asr_failures"]
    assert [f["id"] for f in failures] == ["s01-l02"]

    engine, asr = FakeTtsEngine(), FakeAsrEngine()
    second = voice_episode(
        script_path, engine, VOICE, public, {}, verifier=fake_asr_verifier(asr)
    )

    assert engine.texts == []
    # 缓存命中的句子（通过的和没通过的）都不再识别
    assert asr.heard == []
    assert second == first
    assert _report(script_path)["asr_failures"] == failures


def test_a_line_with_handwritten_speech_is_checked_against_the_speech(
    tmp_path, script_path
):
    # s02-l01 的字幕是"不要重复"，手写的 speech 是"不要重复你自己"
    engine = FakeTtsEngine()

    voice_episode(
        script_path,
        engine,
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
    )

    assert engine.texts.count("不要重复你自己") == 1
    assert _report(script_path) == {"asr_failures": [], "asr_pinyin_passes": []}


def test_retry_count_is_configurable(tmp_path, script_path):
    asr = FakeAsrEngine(mishear={"今天读一本书": ["今天"] * 9})
    engine = FakeTtsEngine()

    voice_episode(
        script_path,
        engine,
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(asr, max_retries=0),
    )

    assert engine.texts.count("今天读一本书") == 1
    assert [f["id"] for f in _report(script_path)["asr_failures"]] == ["s01-l01"]


class SeedRecordingEngine(FakeTtsEngine):
    def __init__(self):
        super().__init__()
        self.seeds = []

    def synthesize(self, text, voice, out):
        self.seeds.append(voice.params.get("seed"))
        return super().synthesize(text, voice, out)


def test_retries_change_a_fixed_random_seed(tmp_path, script_path):
    asr = FakeAsrEngine(mishear={"今天读一本书": ["今天"] * 3})
    engine = SeedRecordingEngine()
    seeded = replace(VOICE, params={**VOICE.params, "seed": 7})

    voice_episode(
        script_path,
        engine,
        seeded,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(asr),
    )

    assert engine.seeds == [7, 8, 9, 7, 7] + [7] * len(OUTRO)


# ---- 复核分两步：先比字，不通过再比拼音（票 07，2026-10-28 用户决定） ----


def strict(asr=None, max_retries=2):
    """阈值 0：规范化后一字不差，或者拼音一个不差。"""
    return Verifier(asr or FakeAsrEngine(), max_diff_rate=0, max_retries=max_retries)


def test_a_homophone_misheard_passes_on_pinyin_without_a_retry(tmp_path, script_path):
    asr = FakeAsrEngine(mishear={"它讲怎样写好代码": ["他讲怎样写好代码"]})
    engine = FakeTtsEngine()

    voice_episode(
        script_path, engine, VOICE, tmp_path / "public", {}, verifier=strict(asr)
    )

    assert engine.texts.count("它讲怎样写好代码") == 1
    verification = _cache_records(script_path)["它讲怎样写好代码"]["verification"]
    assert verification["passed"] is True
    assert verification["attempts"] == [
        {
            "heard": "他讲怎样写好代码",
            "diff_rate": 1 / 8,
            "pinyin_diff_rate": 0,
            "passed_by": "pinyin",
        }
    ]
    report = _report(script_path)
    assert report["asr_failures"] == []
    # 靠拼音通过的句子也列进报告，方便查同音字
    [passed] = report["asr_pinyin_passes"]
    cached = passed.pop("cache")
    assert passed == {
        "id": "s01-l02",
        "text": "它讲怎样写好代码",
        "spoken": "它讲怎样写好代码",
        "heard": "他讲怎样写好代码",
        "diff_rate": 1 / 8,
        "pinyin_diff_rate": 0,
    }
    assert (script_path.parents[2] / cached).is_file()


def test_a_single_misread_character_fails_both_chars_and_pinyin(tmp_path, script_path):
    # 03 里真实出现过的误读："写"读成了"选"，字和拼音都不同
    script_path.write_text(SCRIPT.replace("今天读一本书", "所以每条知识只写一次"))
    asr = FakeAsrEngine(mishear={"所以每条知识只写一次": ["所以每条知识只选一次"] * 3})
    engine = FakeTtsEngine()

    voice_episode(
        script_path, engine, VOICE, tmp_path / "public", {}, verifier=strict(asr)
    )

    assert engine.texts.count("所以每条知识只写一次") == 3
    verification = _cache_records(script_path)["所以每条知识只写一次"]["verification"]
    assert verification["passed"] is False
    assert verification["attempts"][0] == {
        "heard": "所以每条知识只选一次",
        "diff_rate": 0.1,
        "pinyin_diff_rate": 0.1,
        "passed_by": None,
    }
    report = _report(script_path)
    assert report["asr_pinyin_passes"] == []
    [failure] = report["asr_failures"]
    assert failure["id"] == "s01-l01"
    assert failure["diff_rate"] == 0.1
    assert failure["pinyin_diff_rate"] == 0.1


def test_cache_written_before_the_pinyin_step_is_reused_and_reported(
    tmp_path, script_path
):
    public = tmp_path / "public"
    asr = FakeAsrEngine(mishear={"它讲怎样写好代码": ["它讲怎样写坏代码"] * 3})
    voice_episode(script_path, FakeTtsEngine(), VOICE, public, {}, verifier=strict(asr))
    # 改回两步复核之前的格式：每一版只有识别结果和字符差异率
    cache = script_path.parents[2] / "cache" / "tts"
    for path in cache.glob("*.json"):
        record = json.loads(path.read_text())
        record["verification"]["attempts"] = [
            {"heard": a["heard"], "diff_rate": a["diff_rate"]}
            for a in record["verification"]["attempts"]
        ]
        path.write_text(json.dumps(record, ensure_ascii=False))

    engine = FakeTtsEngine()
    voice_episode(script_path, engine, VOICE, public, {}, verifier=strict())

    assert engine.texts == []
    report = _report(script_path)
    assert report["asr_pinyin_passes"] == []
    [failure] = report["asr_failures"]
    assert failure["id"] == "s01-l02"
    assert failure["diff_rate"] == 1 / 8
    assert failure["pinyin_diff_rate"] is None


def test_passed_cache_written_before_the_pinyin_step_is_reused_and_not_reported(
    tmp_path, script_path
):
    public = tmp_path / "public"
    voice_episode(script_path, FakeTtsEngine(), VOICE, public, {}, verifier=strict())
    # 改回两步复核之前的格式：每一版只有识别结果和字符差异率
    cache = script_path.parents[2] / "cache" / "tts"
    for path in cache.glob("*.json"):
        record = json.loads(path.read_text())
        record["verification"]["attempts"] = [
            {"heard": a["heard"], "diff_rate": a["diff_rate"]}
            for a in record["verification"]["attempts"]
        ]
        path.write_text(json.dumps(record, ensure_ascii=False))

    engine = FakeTtsEngine()
    voice_episode(script_path, engine, VOICE, public, {}, verifier=strict())

    assert engine.texts == []
    assert _report(script_path) == {"asr_failures": [], "asr_pinyin_passes": []}


# --- 缺字检查（票 09）：字幕文本里每个字在像素字体里都要有字形 ---

FONT = REPO_ROOT / "video" / "public" / SUBTITLE_FONT


def test_every_subtitle_character_in_the_font_reports_no_missing_glyphs(
    tmp_path, script_path
):
    voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        tmp_path / "public",
        {},
        verifier=fake_asr_verifier(),
        font=FONT,
    )

    assert _report(script_path)["missing_glyphs"] == []


def test_a_character_missing_from_the_font_is_reported_with_its_line(
    tmp_path, script_path
):
    # "𠀀"（扩展 B 区）不在字体里；同一句里重复出现只报一次
    script_path.write_text(SCRIPT.replace("它讲怎样写好代码", "它讲𠀀怎样写好𠀀代码"))

    with pytest.raises(PipelineError, match="s01-l02"):
        voice_episode(
            script_path,
            FakeTtsEngine(),
            VOICE,
            tmp_path / "public",
            {},
            verifier=fake_asr_verifier(),
            font=FONT,
        )

    assert _report(script_path)["missing_glyphs"] == [{"id": "s01-l02", "char": "𠀀"}]


def test_a_character_missing_from_the_font_in_the_title_is_reported_as_title(
    tmp_path, script_path
):
    # 左上角的主题也用像素字体显示，一样要查
    script_path.write_text(SCRIPT.replace("title: 程序员修炼之道", "title: 𠀀之书"))

    with pytest.raises(PipelineError, match="title"):
        voice_episode(
            script_path,
            FakeTtsEngine(),
            VOICE,
            tmp_path / "public",
            {},
            verifier=fake_asr_verifier(),
            font=FONT,
        )

    assert _report(script_path)["missing_glyphs"] == [{"id": "title", "char": "𠀀"}]


def test_a_missing_font_file_is_rejected_before_any_voicing(tmp_path, script_path):
    engine = FakeTtsEngine()

    with pytest.raises(PipelineError, match="nope.woff2"):
        voice_episode(
            script_path,
            engine,
            VOICE,
            tmp_path / "public",
            {},
            verifier=fake_asr_verifier(),
            font=tmp_path / "nope.woff2",
        )

    assert engine.texts == []


def test_missing_glyphs_fail_before_voicing_leaving_stage_and_lock_untouched(
    tmp_path, script_path
):
    public = tmp_path / "public"
    voice_episode(
        script_path,
        FakeTtsEngine(),
        VOICE,
        public,
        {},
        verifier=fake_asr_verifier(),
        font=FONT,
    )
    staged = {
        p.relative_to(public): p.read_bytes() for p in public.rglob("*") if p.is_file()
    }
    lock = _lock(script_path).read_text()
    manifest = (script_path.parent / "episode.json").read_text()

    script_path.write_text(SCRIPT.replace("它讲怎样写好代码", "它讲𠀀怎样写好代码"))
    engine = FakeTtsEngine()
    with pytest.raises(PipelineError) as error:
        voice_episode(
            script_path,
            engine,
            VOICE,
            public,
            {},
            verifier=fake_asr_verifier(),
            font=FONT,
        )

    assert "s01-l02" in str(error.value) and "𠀀" in str(error.value)
    assert _report(script_path) == {"missing_glyphs": [{"id": "s01-l02", "char": "𠀀"}]}
    assert engine.texts == []
    assert {
        p.relative_to(public): p.read_bytes() for p in public.rglob("*") if p.is_file()
    } == staged
    assert _lock(script_path).read_text() == lock
    assert (script_path.parent / "episode.json").read_text() == manifest


def test_missing_glyphs_on_the_first_voicing_write_no_lock(tmp_path, script_path):
    script_path.write_text(SCRIPT.replace("title: 程序员修炼之道", "title: 𠀀之书"))

    with pytest.raises(PipelineError, match="title"):
        voice_episode(
            script_path,
            FakeTtsEngine(),
            VOICE,
            tmp_path / "public",
            {},
            verifier=fake_asr_verifier(),
            font=FONT,
        )

    assert not _lock(script_path).exists()
    assert not (tmp_path / "public").exists()
