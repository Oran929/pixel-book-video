## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.

## 工作约定

- 因为环境限制（权限、网络、缺工具）而改变实现方式时，在票的 Comments 里写明原因和影响，不要悄悄绕过。
- 发现会影响后续票的事，写进那张票的 Comments。
- 做的改动推翻了之前某张票 Comments 里的说法时，回到那条留言标注「已失效」，写明被哪张票、改成了什么。仍然有效的约定写进 ADR、spec、`GLOSSARY.md` 或 README，Comments 只当历史记录。
- `/implement` 不改票的状态。票做完后，核对完验收项，再把 `Status:` 改为 `done`（见 `docs/agents/triage-labels.md`）。
