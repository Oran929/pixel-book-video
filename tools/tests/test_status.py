"""`pixelbook status`：在临时仓库里依次摆出各阶段的文件，断言阶段、关口和下一步。"""

import json
import os
import subprocess

import pytest

from pixelbook import cli

EPISODE = "books/demo/ch01/ep01"


def _git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "config", "user.email", "test@example.com")
    _git(tmp_path, "config", "user.name", "test")
    (tmp_path / "books" / "demo" / "ch01").mkdir(parents=True)
    return tmp_path


def _status(repo, capsys, *flags, episode=EPISODE):
    code = cli.main(["status", str(repo / episode), *flags])
    return code, capsys.readouterr().out


def _json(repo, capsys, episode=EPISODE):
    code, out = _status(repo, capsys, "--json", episode=episode)
    assert code == 0
    return json.loads(out)


def test_an_episode_missing_from_the_outline_needs_the_outline_skill(repo, capsys):
    result = _json(repo, capsys)

    assert result["stage"] == "not-in-outline"
    assert result["gate"] is None
    assert result["next"] == ["/outline demo ch01"]

    code, out = _status(repo, capsys)
    assert code == 0
    assert "大纲里没有这一期" in out
    assert "/outline demo ch01" in out


def _write(repo, path, text=""):
    file = repo / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(text)
    return file


OUTLINE = "books/demo/ch01/outline.yaml"


def _entry(episode="ep01", topic="主题"):
    """大纲里一期的条目。"""
    return f"""\
  - id: {episode}
    topic: {topic}
    units: [1]
    segments:
      - title: 开场
        minutes: 1
    points:
      - id: p01
        text: 观点
        cite: ch01-¶001
"""


def _outline(repo, commit=True, entries=None):
    _write(repo, OUTLINE, "chapter: 1\nepisodes:\n" + (entries or _entry()))
    if commit:
        _commit(repo)


def _commit(repo):
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "x")


def _books_repo(repo):
    """项目仓库忽略 books/，books/ 是它自己的书仓库（ADR-0014）。"""
    _write(repo, ".gitignore", "/books/\n")
    _commit(repo)
    books = repo / "books"
    _git(books, "init", "-q")
    _git(books, "config", "user.email", "test@example.com")
    _git(books, "config", "user.name", "test")
    return books


def test_an_outline_committed_to_the_books_repo_passes_gate_1(repo, capsys):
    books = _books_repo(repo)
    _outline(repo, commit=False)
    assert _json(repo, capsys)["stage"] == "outline-review"

    _commit(books)

    result = _json(repo, capsys)
    assert result["stage"] == "no-script"
    # 路径仍然相对项目仓库
    assert result["next"] == [f"/script {EPISODE}"]


def test_a_book_ignored_by_the_project_repo_is_an_error(repo, capsys):
    _write(repo, ".gitignore", "/books/\n")
    _outline(repo)

    code, out = _status(repo, capsys)

    assert code != 0
    assert "被 Git 忽略" in out


def test_an_uncommitted_outline_waits_at_gate_1(repo, capsys):
    _outline(repo, commit=False)

    result = _json(repo, capsys)

    assert result["stage"] == "outline-review"
    assert result["gate"] == 1
    assert result["next"] == []
    assert "books/demo/ch01/outline.yaml" in result["review"]

    _, out = _status(repo, capsys)
    assert "大纲待审（人工关口 1）" in out


def test_an_outline_entry_edited_after_commit_waits_at_gate_1_again(repo, capsys):
    _outline(repo)
    _outline(repo, commit=False, entries=_entry(topic="改过的主题"))

    assert _json(repo, capsys)["stage"] == "outline-review"


def test_only_this_episodes_outline_entry_decides_gate_1(repo, capsys):
    # 大纲里加了别的期但还没提交，已经审过的这一期不退回关口 1
    _outline(repo)
    _outline(repo, commit=False, entries=_entry() + _entry("ep02"))
    _write(repo, OUTLINE, (repo / OUTLINE).read_text() + "# 备注\n")

    assert _json(repo, capsys)["stage"] == "no-script"
    assert _json(repo, capsys, episode="books/demo/ch01/ep02")["stage"] == (
        "outline-review"
    )


def test_an_episode_added_to_a_committed_outline_waits_at_gate_1(repo, capsys):
    _outline(repo, entries=_entry("ep02"))
    _outline(repo, commit=False, entries=_entry("ep02") + _entry())

    assert _json(repo, capsys)["stage"] == "outline-review"


def test_a_malformed_outline_exits_nonzero_naming_the_problem(repo, capsys):
    _write(repo, OUTLINE, "chapter: 1\nepisodes:\n  - id: ep01\n")

    code, out = _status(repo, capsys)

    assert code != 0
    assert "`topic` 缺失" in out
    assert "pixelbook outline" in out


def test_an_outline_that_is_not_yaml_exits_nonzero(repo, capsys):
    _write(repo, OUTLINE, "chapter: [1\n")

    code, out = _status(repo, capsys)

    assert code != 0
    assert "不是合法的 YAML" in out


def test_a_committed_outline_without_a_script_needs_the_script_skill(repo, capsys):
    _outline(repo)

    result = _json(repo, capsys)

    assert result["stage"] == "no-script"
    assert result["gate"] is None
    assert result["next"] == [f"/script {EPISODE}"]
    _, out = _status(repo, capsys)
    assert "没有旁白稿" in out


def _script(repo, status="draft"):
    _write(
        repo,
        f"{EPISODE}/script.yaml",
        f"""\
title: 标题
status: {status}
segments:
  - id: s01
    title: 开场
    scenes:
      - id: s01-v01
        description: 画面
        lines:
          - id: s01-l01
            text: 一句话
            cite: ch01-¶001
""",
    )


def test_a_draft_without_factcheck_needs_the_factcheck_skill(repo, capsys):
    _outline(repo)
    _script(repo)

    result = _json(repo, capsys)

    assert result["stage"] == "script-review"
    assert result["gate"] is None
    assert result["next"] == [f"/factcheck {EPISODE}"]


def test_a_draft_with_factcheck_waits_at_gate_2(repo, capsys):
    _outline(repo)
    _script(repo)
    _write(repo, f"{EPISODE}/factcheck.yaml", "round: 1\n")

    result = _json(repo, capsys)

    assert result["stage"] == "script-review"
    assert result["gate"] == 2
    assert result["next"] == []
    assert f"{EPISODE}/script.yaml" in result["review"]
    assert f"{EPISODE}/factcheck.yaml" in result["review"]
    _, out = _status(repo, capsys)
    assert "旁白稿待审（人工关口 2）" in out


def test_a_malformed_script_exits_nonzero_naming_the_problem(repo, capsys):
    _outline(repo)
    _write(repo, f"{EPISODE}/script.yaml", "status: final\nsegments: []\n")
    _write(repo, f"{EPISODE}/factcheck.yaml", "round: 1\n")

    code, out = _status(repo, capsys)

    assert code != 0
    assert "`title` 缺失" in out
    assert "pixelbook check" in out


def test_a_final_script_without_factcheck_needs_the_factcheck_skill(repo, capsys):
    _outline(repo)
    _script(repo, "final")

    result = _json(repo, capsys)

    assert result["stage"] == "script-review"
    assert result["next"] == [f"/factcheck {EPISODE}"]


def _final(repo):
    _outline(repo)
    _script(repo, "final")
    _write(repo, f"{EPISODE}/factcheck.yaml", "round: 1\n")


def test_a_final_script_needs_term_audition_then_voicing(repo, capsys):
    _final(repo)

    result = _json(repo, capsys)

    assert result["stage"] == "ready-to-voice"
    assert result["gate"] is None
    assert result["next"] == [
        f"pixelbook terms {EPISODE}/script.yaml",
        f"pixelbook voice {EPISODE}/script.yaml",
    ]
    _, out = _status(repo, capsys)
    assert "定稿待配音" in out


MANIFEST = f"{EPISODE}/out/episode.json"
STORYBOARD = f"{EPISODE}/storyboard.json"
TIMELINE = f"{EPISODE}/out/timeline.json"
VIDEO = f"{EPISODE}/out/demo-ch01-ep01.mp4"


def _at(repo, path, seconds):
    """把 `path` 的修改时间设成 `seconds`（越大越新）。"""
    os.utime(repo / path, (seconds, seconds))


def _voiced(repo):
    _final(repo)
    _write(repo, MANIFEST, "{}")
    _at(repo, f"{EPISODE}/script.yaml", 1_000)
    _at(repo, MANIFEST, 2_000)


def test_a_voiced_episode_without_a_storyboard_needs_the_storyboard_skill(repo, capsys):
    _voiced(repo)

    result = _json(repo, capsys)

    assert result["stage"] == "no-storyboard"
    assert result["gate"] is None
    assert result["next"] == [f"/storyboard {EPISODE}"]
    assert result["stale"] == []
    _, out = _status(repo, capsys)
    assert "没有分镜" in out


def test_a_storyboard_without_a_video_needs_render(repo, capsys):
    _voiced(repo)
    _write(repo, STORYBOARD, "{}")

    result = _json(repo, capsys)

    assert result["stage"] == "ready-to-render"
    assert result["next"] == [f"pixelbook render {EPISODE}/script.yaml"]
    _, out = _status(repo, capsys)
    assert "待渲染" in out


def _rendered(repo):
    _voiced(repo)
    _write(repo, STORYBOARD, "{}")
    _write(repo, TIMELINE, "{}")
    _write(repo, VIDEO)
    _at(repo, STORYBOARD, 3_000)
    _at(repo, TIMELINE, 4_000)
    _at(repo, VIDEO, 5_000)


def test_a_rendered_video_with_an_uncommitted_storyboard_waits_at_gate_3(repo, capsys):
    _rendered(repo)

    result = _json(repo, capsys)

    assert result["stage"] == "video-review"
    assert result["gate"] == 3
    assert result["next"] == []
    assert VIDEO in result["review"]
    _, out = _status(repo, capsys)
    assert "成片待审（人工关口 3）" in out


def test_a_committed_storyboard_means_the_video_was_approved(repo, capsys):
    _rendered(repo)
    _commit(repo)  # 产物目录 out/ 在真仓库里被忽略，这里提交进去也不影响判断
    _at(repo, f"{EPISODE}/script.yaml", 1_000)
    _at(repo, MANIFEST, 2_000)
    _at(repo, STORYBOARD, 3_000)
    _at(repo, TIMELINE, 4_000)
    _at(repo, VIDEO, 5_000)

    result = _json(repo, capsys)

    assert result["stage"] == "done"
    assert result["gate"] is None
    assert result["next"] == []
    _, out = _status(repo, capsys)
    assert "已完成" in out
    assert "下一步：无" in out


def test_a_script_newer_than_the_manifest_reruns_from_voicing(repo, capsys):
    _rendered(repo)
    _at(repo, f"{EPISODE}/script.yaml", 6_000)

    result = _json(repo, capsys)

    assert result["stage"] == "ready-to-voice"
    assert result["rerun_from"] == "配音"
    assert result["stale"] == [f"合成清单 {MANIFEST} 比旁白稿 {EPISODE}/script.yaml 旧"]
    assert result["next"] == [
        f"pixelbook terms {EPISODE}/script.yaml",
        f"pixelbook voice {EPISODE}/script.yaml",
    ]
    _, out = _status(repo, capsys)
    assert "产物过期，从「配音」重跑" in out
    assert "已完成" not in out


@pytest.mark.parametrize(
    ("name", "path"),
    [
        ("读音表", "pronunciation.yaml"),
        ("书配置", "books/demo/book.yaml"),
        ("音色配置", "voice.yaml"),
    ],
)
def test_a_voicing_config_newer_than_the_manifest_reruns_from_voicing(
    repo, capsys, name, path
):
    _rendered(repo)
    _write(repo, path, "{}\n")
    _at(repo, path, 6_000)

    result = _json(repo, capsys)

    assert result["stage"] == "ready-to-voice"
    assert result["rerun_from"] == "配音"
    assert result["stale"] == [f"合成清单 {MANIFEST} 比{name} {path} 旧"]


def test_a_book_voice_override_is_a_voicing_input(repo, capsys):
    _rendered(repo)
    _write(repo, "books/demo/book.yaml", "voice: voices/yujie.yaml\n")
    _write(repo, "voices/yujie.yaml", "{}\n")
    _write(repo, "voice.yaml", "{}\n")
    _at(repo, "books/demo/book.yaml", 1_000)
    _at(repo, "voice.yaml", 6_000)
    _at(repo, "voices/yujie.yaml", 7_000)

    result = _json(repo, capsys)

    assert result["stale"] == [f"合成清单 {MANIFEST} 比音色配置 voices/yujie.yaml 旧"]


def test_a_storyboard_newer_than_the_timeline_reruns_from_the_timeline(repo, capsys):
    _rendered(repo)
    _commit(repo)
    _at(repo, STORYBOARD, 4_500)
    _at(repo, TIMELINE, 4_000)
    _at(repo, VIDEO, 5_000)

    result = _json(repo, capsys)

    assert result["stage"] == "ready-to-render"
    assert result["rerun_from"] == "时间轴"
    assert result["stale"] == [f"时间轴 {TIMELINE} 比分镜 {STORYBOARD} 旧"]
    assert result["next"] == [f"pixelbook render {EPISODE}/script.yaml"]


def test_a_manifest_newer_than_the_timeline_reruns_from_the_timeline(repo, capsys):
    _rendered(repo)
    _at(repo, MANIFEST, 4_500)

    result = _json(repo, capsys)

    assert result["stage"] == "ready-to-render"
    assert result["stale"] == [f"时间轴 {TIMELINE} 比合成清单 {MANIFEST} 旧"]


def test_a_timeline_newer_than_the_video_reruns_from_rendering(repo, capsys):
    _rendered(repo)
    _at(repo, TIMELINE, 6_000)

    result = _json(repo, capsys)

    assert result["stage"] == "ready-to-render"
    assert result["rerun_from"] == "渲染"
    assert result["stale"] == [f"成片 {VIDEO} 比时间轴 {TIMELINE} 旧"]


@pytest.mark.parametrize(
    ("episode", "message"),
    [
        ("notbooks/demo/ch01/ep01", "不是期目录"),
        ("books/demo/chapter1/ep01", "不是章目录"),
        ("books/demo/ch09/ep01", "不存在"),
    ],
)
def test_an_invalid_episode_dir_exits_nonzero_with_a_reason(
    repo, capsys, episode, message
):
    code, out = _status(repo, capsys, episode=episode)

    assert code != 0
    assert message in out


def test_an_episode_path_that_is_a_file_exits_nonzero(repo, capsys):
    _write(repo, EPISODE, "")

    code, out = _status(repo, capsys)

    assert code != 0
    assert "不是目录" in out


def test_an_episode_outside_a_git_repo_exits_nonzero(tmp_path, capsys):
    (tmp_path / "books" / "demo" / "ch01").mkdir(parents=True)

    code, out = _status(tmp_path, capsys)

    assert code != 0
    assert "不在 Git 仓库里" in out
