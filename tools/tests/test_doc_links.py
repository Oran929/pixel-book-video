"""文档链接检查（#59）：失效的相对链接和失效的「标题」引用要报出文件和行号。"""

from pixelbook import REPO_ROOT
from pixelbook.doc_links import broken_links, scanned_files


def write(root, path, text):
    file = root / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(text, encoding="utf-8")
    return file


def test_reports_relative_link_to_missing_file(tmp_path):
    write(tmp_path, "docs/a.md", "# A\n\n先看 [B](b.md)，再看 [C](missing.md)。\n")
    write(tmp_path, "docs/b.md", "# B\n")

    assert broken_links(tmp_path, [tmp_path / "docs/a.md"]) == [
        "docs/a.md:3: 链接的文件不存在：missing.md"
    ]


def test_reports_title_reference_to_missing_heading(tmp_path):
    write(
        tmp_path, "README.md", "# 项目\n\n## 检查\n\n```\n# 代码块里的不算标题\n```\n"
    )
    write(tmp_path, "docs/ref.md", "# 分镜\n\n## 配乐\n\n### 选曲\n")
    skill = write(
        tmp_path,
        ".claude/skills/x/SKILL.md",
        "格式以 docs/ref.md「分镜」为准，选曲见 `docs/ref.md`「配乐 › 选曲」。\n"
        "检查见 README「检查」。\n"
        "音效见 docs/ref.md「音效」，代码块见 README『代码块里的不算标题』。\n"
        "旧的见 docs/gone.md「分镜」。\n",
    )

    assert broken_links(tmp_path, [skill]) == [
        ".claude/skills/x/SKILL.md:3: docs/ref.md 里没有标题「音效」",
        ".claude/skills/x/SKILL.md:3: README.md 里没有标题「代码块里的不算标题」",
        ".claude/skills/x/SKILL.md:4: 引用的文件不存在：docs/gone.md",
    ]


def test_links_inside_code_fences_are_not_checked(tmp_path):
    doc = write(
        tmp_path,
        "docs/a.md",
        "# A\n\n```python\nre.compile(r'[x](y)')\n```\n\n再看 [C](missing.md)。\n",
    )

    assert broken_links(tmp_path, [doc]) == [
        "docs/a.md:7: 链接的文件不存在：missing.md"
    ]


def test_a_reference_right_after_chinese_text_is_checked(tmp_path):
    write(tmp_path, "README.md", "# 项目\n\n## 检查\n")
    write(tmp_path, "docs/a.md", "# A\n\n## x\n")
    skill = write(
        tmp_path,
        ".claude/skills/x/SKILL.md",
        "见README「检查」，见README「没有」。\n见docs/a.md「x」，见docs/a.md「y」。\n",
    )

    assert broken_links(tmp_path, [skill]) == [
        ".claude/skills/x/SKILL.md:1: README.md 里没有标题「没有」",
        ".claude/skills/x/SKILL.md:2: docs/a.md 里没有标题「y」",
    ]


def test_repository_has_no_broken_links():
    assert broken_links(REPO_ROOT, scanned_files(REPO_ROOT)) == []
