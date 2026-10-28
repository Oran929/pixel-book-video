import json
import re
import shutil

import pytest

from pixelbook import REPO_ROOT
from pixelbook.pipeline import PipelineError, stage_episode, voice_episode
from pixelbook.pronunciation import load_pronunciation
from pixelbook.script import ScriptError
from pixelbook.tts import FakeTtsEngine
from pixelbook.voice import Voice

VOICE = Voice(model="base-model", ref_audio="voices/a.wav", ref_text="你好。")

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
