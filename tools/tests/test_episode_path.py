"""期目录 `books/<书>/<章>/<期>/` 的路径类型。"""

from pathlib import Path

import pytest

from pixelbook.episode_path import OUT_DIR, EpisodePath, EpisodePathError

ROOT = Path("/repo")


def test_a_script_path_gives_every_directory_file_and_the_episode_id():
    episode = EpisodePath.from_script(
        ROOT / "books" / "pragprog" / "ch02" / "ep01" / "script.yaml"
    )

    assert episode.book_dir == ROOT / "books" / "pragprog"
    assert episode.chapter_dir == ROOT / "books" / "pragprog" / "ch02"
    assert episode.dir == ROOT / "books" / "pragprog" / "ch02" / "ep01"
    assert episode.outline == ROOT / "books" / "pragprog" / "ch02" / "outline.yaml"
    assert (
        episode.script == ROOT / "books" / "pragprog" / "ch02" / "ep01" / "script.yaml"
    )
    assert (
        episode.factcheck
        == ROOT / "books" / "pragprog" / "ch02" / "ep01" / "factcheck.yaml"
    )
    assert episode.id == "pragprog-ch02-ep01"


def test_generated_files_are_all_in_the_episode_out_dir():
    episode = EpisodePath(ROOT / "books" / "pragprog" / "ch02" / "ep01")
    out = ROOT / "books" / "pragprog" / "ch02" / "ep01" / "out"

    assert episode.storyboard == episode.dir / "storyboard.json"
    assert episode.out_dir == out
    assert episode.manifest == out / "episode.json"
    assert episode.report == out / "report.json"
    assert episode.timeline == out / "timeline.json"
    assert episode.segments == out / "segments.txt"
    assert episode.credits == out / "credits.txt"
    # 混音和新术语试听只在本期的 out/ 里，文件名不带 ID（spec #56）
    assert episode.mix == out / "mix.wav"
    assert episode.terms_dir == out / "terms"


def test_the_out_dir_and_file_names_match_the_timeline_export():
    # 时间轴导出命令（TS）往同一个期目录和产物目录里读写，两边的名字要一致
    ts = (
        Path(__file__).resolve().parents[2] / "video" / "src" / "episode" / "out-dir.ts"
    ).read_text()
    episode = EpisodePath(ROOT / "books" / "pragprog" / "ch02" / "ep01")
    shared = {
        "OUT_DIR": episode.out_dir,
        "MANIFEST_FILE": episode.manifest,
        "STORYBOARD_FILE": episode.storyboard,
        "TIMELINE_FILE": episode.timeline,
        "SEGMENTS_FILE": episode.segments,
        "CREDITS_FILE": episode.credits,
    }

    for name, path in shared.items():
        assert f'export const {name} = "{path.name}";' in ts, name
    assert OUT_DIR == "out"


@pytest.mark.parametrize(
    "script",
    [
        # 少了章这一级
        ROOT / "books" / "pragprog" / "ep01" / "script.yaml",
        # 不在 books/ 下
        ROOT / "drafts" / "pragprog" / "ch02" / "ep01" / "script.yaml",
        # 不是旁白稿
        ROOT / "books" / "pragprog" / "ch02" / "ep01" / "notes.yaml",
    ],
)
def test_a_path_outside_the_layout_is_rejected_naming_the_layout(script):
    with pytest.raises(EpisodePathError, match=r"books/<书>/<章>/<期>/script\.yaml"):
        EpisodePath.from_script(script)


def test_an_episode_dir_outside_the_layout_is_rejected():
    with pytest.raises(EpisodePathError, match=r"books/<书>/<章>/<期>/"):
        EpisodePath(ROOT / "books" / "ch02" / "ep01")
