"""文档链接检查（#59）：skill、README、`docs/`（以及源码注释）里的相对链接，以及「文档路径「标题」」引用。

- 相对链接 `[文字](路径)`（只在 Markdown 里，代码块里的不查）：按所在文件的目录解析，目标文件不存在就报。
- 标题引用 `docs/reference/storyboard.md「音效」`：路径按仓库根目录解析，`README` 指根目录的 README.md
  （也接受相对所在文件的写法），目标文件里没有这个标题就报。`「配乐 › 选曲」`这种写法
  每一级都要是目标文件里的标题。`『』` 和 `「」` 都认。

每处失效报一行 `文件:行号: 原因`，文件是相对仓库根目录的路径。
"""

import re
from pathlib import Path

MARKDOWN_LINK = re.compile(r"\]\(([^)\s]+)\)")
# 文档路径（`README` 或 `….md`，可以包在反引号里）紧跟一个或几个「标题」。
# 路径只由 ASCII 字符组成，所以前面紧贴汉字（「见」）时也认得出
TITLE_REFERENCE = re.compile(
    r"(?<![A-Za-z0-9_./-])`?(?P<path>README|[A-Za-z0-9_./-]+\.md)`?"
    r"(?P<titles>(?:[「『][^」』]+[」』])+)"
)
HEADING = re.compile(r"^#{1,6}\s+(.+)$")


def scanned_files(root: Path) -> list[Path]:
    """要检查的文件：skill、README、`docs/` 下的 Markdown，`tools/src`、`video/src` 的源码。"""
    files = [root / "README.md"]
    files += sorted((root / ".claude" / "skills").rglob("*.md"))
    files += sorted((root / "docs").rglob("*.md"))
    # 源码注释和报错里的「见 docs/…「标题」」引用也查
    files += sorted((root / "tools" / "src").rglob("*.py"))
    for pattern in ("*.ts", "*.tsx"):
        files += sorted((root / "video" / "src").rglob(pattern))
    return [file for file in files if file.is_file()]


def broken_links(root: Path, files: list[Path]) -> list[str]:
    """`files` 里所有失效的链接和标题引用，按文件、行号排列。"""
    problems = []
    for file in files:
        where = file.relative_to(root).as_posix()
        fenced = False
        for number, line in enumerate(file.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith("```"):
                fenced = not fenced
            # 源码里、代码块里的 `](…)` 多是正则或代码，相对链接只在 Markdown 正文里查
            markdown = file.suffix == ".md" and not fenced
            links = MARKDOWN_LINK.findall(line) if markdown else []
            for target in links:
                if _is_external(target):
                    continue
                path = target.split("#", 1)[0]
                if path and not (file.parent / path).exists():
                    problems.append(f"{where}:{number}: 链接的文件不存在：{target}")
            for reference in TITLE_REFERENCE.finditer(line):
                problems += [
                    f"{where}:{number}: {problem}"
                    for problem in _check_title_reference(root, file, reference)
                ]
    return problems


def _check_title_reference(root: Path, file: Path, reference: re.Match) -> list[str]:
    path = reference["path"]
    if path == "README":
        path = "README.md"
    target = next(
        (
            candidate
            for candidate in (root / path, file.parent / path)
            if candidate.is_file()
        ),
        None,
    )
    if target is None:
        return [f"引用的文件不存在：{path}"]
    headings = _headings(target)
    titles = re.findall(r"[「『]([^」』]+)[」』]", reference["titles"])
    return [
        f"{path} 里没有标题「{title}」"
        for title in titles
        if any(level.strip() not in headings for level in title.split("›"))
    ]


def _headings(file: Path) -> set[str]:
    """文件里的 Markdown 标题（代码块里的不算）；`知识块 \\`PixelBlock\\`` 也可以只写 `知识块`。"""
    headings = set()
    fenced = False
    for line in file.read_text(encoding="utf-8").splitlines():
        if line.startswith("```"):
            fenced = not fenced
            continue
        match = HEADING.match(line)
        if match and not fenced:
            text = match[1].strip()
            headings.add(text)
            headings.add(re.sub(r"\s*`[^`]*`$", "", text))
    return headings


def _is_external(target: str) -> bool:
    return re.match(r"^[a-z][a-z0-9+.-]*:", target) is not None
