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


def test_repository_has_no_broken_links():
    assert broken_links(REPO_ROOT, scanned_files(REPO_ROOT)) == []
