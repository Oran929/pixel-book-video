# 01: 仓库骨架与统一检查命令

**What to build:** 仓库具备 spec 约定的目录分层（书 → 章 → 期，原始资料与生成物分开，Python 工具和 Remotion 项目分开）。Python 部分是一个由 uv 管理的项目，Remotion 部分是一个 React + TypeScript 项目。有一条统一命令，能一次跑完两边的测试、类型检查和 lint，并且两边各有一个最简单的测试已经通过。系统装好 ffmpeg。从这张票起，"做完了"的标准就是这条命令通过。

**Blocked by:** None (can start immediately)

**Type:** AFK

**Status:** done

- [x] 目录分层符合 spec 和 `decisions.md` 第 10 节（读音表和项目默认音色配置放在仓库根目录；书配置、锁定音色、缓存放在书目录里）
- [x] `.gitignore` 忽略原书文件、转换出的全文、配音缓存、wav、mp4、Remotion 的产物目录
- [x] Python 环境用 uv 一条命令就能装好；Node 依赖用 npm 一条命令就能装好
- [x] ffmpeg 已安装，`ffmpeg -version` 能运行
- [x] 统一检查命令依次运行 pytest、`tsc`、lint、TS 测试（Vitest），任何一项失败，整体就以非零码退出
- [x] 两边各有一个最简单的测试，并通过统一检查命令
- [x] 安装和检查命令写进一份简短的 README

## Comments

- 已在 `feat/foundation` 实现。统一检查命令是 `make check`，安装命令是 `make install`。
- 项目默认音色配置的文件留给 02 创建，因为它的格式由 02 确定。样例书（书 → 章 → 期的实际目录）由 03 创建。
- `make check` 直接调用 `tools/.venv/bin/*`，不用 `uv run`。这样在不能写 uv 缓存的沙盒里也能运行。
