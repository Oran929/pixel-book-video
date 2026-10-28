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
- 代码改动走 PR，合并前看 Checks（CI 跑 `make check`）是否全绿；私有仓库免费账户设不了「合并前必须通过」，只能靠自己看。纯文档改动可以直接推到 main。
- `/implement` 不改票的状态。票做完后，核对完验收项，再关闭这个 issue（见 `docs/agents/triage-labels.md`）。
