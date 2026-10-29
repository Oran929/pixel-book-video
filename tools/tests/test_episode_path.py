"""期目录 `books/<书>/<章>/<期>/` 的路径类型。"""

from pathlib import Path

import pytest

from pixelbook.episode_path import EpisodePath, EpisodePathError

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
