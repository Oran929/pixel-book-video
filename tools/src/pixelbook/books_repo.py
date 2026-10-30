"""书仓库：项目仓库忽略整个 `books/`，自己的书在 `books/` 里一个只在本机的 Git 仓库里提交（ADR-0014）。

人工关口 1 和 3 以「提交进 Git」为审过，所以书目录必须在一个不忽略它的 Git 仓库里。
"""

import subprocess
from pathlib import Path

# 书仓库里不提交的：原书和转换结果（版权内容）、配音缓存、期目录的产物目录（ADR-0013）
BOOKS_GITIGNORE = """\
*/source.*
*/*.epub
*/*.pdf
*/chapters/
*/cache/
*/*/*/out/
.DS_Store
"""


def git_root(path: Path) -> Path | None:
    """`path` 所在的最近一个 Git 仓库的根目录；不在 Git 仓库里时是 None。"""
    result = _git(path, "rev-parse", "--show-toplevel")
    if result.returncode != 0:
        return None
    return Path(result.stdout.strip()).resolve()


def is_ignored(path: Path) -> bool:
    """`path` 被它所在的 Git 仓库忽略（比如书仓库还没建时，项目仓库忽略的 `books/`）。"""
    return _git(path, "check-ignore", "-q", str(path)).returncode == 0


def ensure_books_repo(books_dir: Path) -> bool:
    """`books_dir` 被项目仓库忽略、自己又不是 Git 仓库时，建好书仓库，返回 True。

    范例的 `examples/books/` 和测试的临时仓库不被忽略，原样不动。
    """
    books_dir.mkdir(parents=True, exist_ok=True)
    if git_root(books_dir) == books_dir.resolve() or not is_ignored(books_dir):
        return False
    _git(books_dir, "init", "-q").check_returncode()
    (books_dir / ".gitignore").write_text(BOOKS_GITIGNORE)
    return True


def _git(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True, check=False
    )
