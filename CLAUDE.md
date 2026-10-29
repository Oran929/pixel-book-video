## Agent skills

### 工单追踪

工单放在 GitHub Issues（Oran929/pixel-book-video），用 `gh` CLI 操作。切换前已完成的票留在 `.scratch/` 作历史记录。见 `docs/agents/issue-tracker.md`。

### 分诊标签

五个默认分诊角色（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`），以 GitHub label 的形式打在 issue 上。见 `docs/agents/triage-labels.md`。

### 领域文档

单上下文：`GLOSSARY.md` 和 `docs/adr/` 放在仓库根目录，用到时再建。见 `docs/agents/domain.md`。

## 工作约定

- 因为环境限制（权限、网络、缺工具）而改变实现方式时，在票的评论里写明原因和影响，不要悄悄绕过。
- 发现会影响后续票的事，写进那张票的评论。
- 做的改动推翻了之前某张票评论里的说法时，回到那条评论标注「已失效」，写明被哪张票、改成了什么。仍然有效的约定写进 ADR、spec、`GLOSSARY.md` 或 README，评论只当历史记录。
- 代码改动走 PR，合并前看 Checks 是否全绿（见 README「检查」）。纯文档改动可以直接推到 main。
- `/implement` 不改票的状态。票做完后，核对完验收项，再关闭这个 issue（见 `docs/agents/triage-labels.md`）。

## 省上下文

一张票通常由一个 subagent 从头做到尾，读过、写过的内容都留在它的上下文里。#50–#52 的 subagent 用到 21–30 万 token，一半是整文件读代码，三分之一是在 Bash 里整份重写文件。

- 先定位再读：`git grep -n` 或 `git grep -l` 找到位置，再按行号读那一段。不要 `cat` 整个文件，也不要循环 `cat` 一个目录。README 只读要用的那一节。
- 长输出截断：命令后面接 `| tail -n 40` 或 `| head`。输出被另存成文件时，用 grep 找需要的部分，不要整份读回来。
- 改代码用 Edit 做小范围替换，不要用 heredoc 或 Python 脚本整份重写文件。改完不用再把文件打印出来核对。
- 读票：`gh issue view <票号> --comments` 只读本票。spec #16 很长，按需要的「修订」或章节 grep，不要整份带评论读。
