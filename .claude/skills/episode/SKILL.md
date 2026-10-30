---
name: episode
description: 做一期视频：每一步按 pixelbook status --json 调度 /outline、/script、/factcheck、新术语、配音、/storyboard、render，停在三个人工关口，审过后从 status 判断的地方接着跑。
argument-hint: <期目录> | <书> <章> <期>
disable-model-invocation: true
---

# /episode <期目录>

参数：`$ARGUMENTS`。给期目录 `books/<书>/chNN/epNN`，或者书、章、期三项（章、期只给数字时补成两位：`2 1` → `ch02/ep01`）。

这份 skill 只做**调度**和**停顿**：下一步是什么只看 `pixelbook status --json`，每一步怎么做以子 skill 和命令为准。状态的含义见 `docs/reference/status.md`「阶段」和「JSON」。

## 循环

### 1. 看状态

```sh
cd tools && uv run pixelbook status ../<期目录> --json
```

退出码 1 时停下，把它打印的原因告诉用户。`stale` 不为空时，在汇报里写上过期原因和 `rerun_from`。

**完成**：拿到 `stage`、`gate`、`next`、`review`。

### 2. 分支

按 `gate` 和 `next` 判断，`stage` 只用来汇报：

- `gate` 是 1、2、3：到第 4 步，停在关口。
- `next` 为空、`gate` 为 `null`（`done`）：告诉用户这一期已完成，结束。
- 否则到第 3 步，按顺序执行 `next` 里的每一条。

### 3. 执行 `next`

- **skill**（`/outline`、`/script`、`/factcheck`、`/storyboard`）：读 `.claude/skills/<名>/SKILL.md`，把这一条里的参数当作 `$ARGUMENTS`，照它的步骤做完。子 skill 停在关口时，它的汇报就是关口的汇报，接着回到第 1 步。
- **`pixelbook` 命令**：在 `tools/` 下用 `uv run` 跑，命令里的路径前面加 `../`。非零退出时按 `docs/reference/render.md`「出了问题」处理；处理不了就停下，把输出交给用户。
- **`pixelbook terms`**：列出新术语时，按 `docs/reference/voice.md`「读音表与新术语」给每个术语定读法、登记进 `pronunciation.yaml`，记下这些术语，在关口 3 的汇报里列出（术语、读法、`out/terms/` 里的试听音频）。没有新术语就直接跑下一条。
- **`pixelbook voice` 报音色和锁定不一致**：停下，把它列出的锁定值和当前值交给用户。音色按书锁定（[ADR-0005](../../../docs/adr/0005-voice-locked-per-book.md)），`--revoice` 只在用户明确说整本书换音色时用。

**完成**：`next` 的每一条都执行成功，回到第 1 步。再看状态时 `stage`、`next` 和执行前完全一样，说明这一步没有生效：停下，把两次的状态交给用户。

### 4. 停在关口

用中文汇报：阶段 `label`、关口编号、`review`，然后停下等用户。汇报内容按子 skill 的关口一节；这一轮刚跑过那个子 skill 时，它的汇报就是这一份，不再重复。

| 关口 | 汇报什么 | 用户说审过时 |
|---|---|---|
| 1 大纲 | `.claude/skills/outline/SKILL.md「7. 交给用户（人工关口 1）」`的清单，从 `outline.yaml` 读 | 提交 `outline.yaml` |
| 2 旁白稿和语义核对结果 | `.claude/skills/script/SKILL.md「7. 交给用户（人工关口 2）」`的清单，从 `script.yaml`、`factcheck.yaml` 和 `pixelbook check` 的输出读 | 按同一节「用户说定稿时」定稿、提交 |
| 3 成片 | `.claude/skills/storyboard/SKILL.md「7. 交给用户（人工关口 3）」`的清单，加上第 3 步记下的新术语 | 提交 `storyboard.json` |

关口 2、3 的清单里，有些内容只在子 skill 当时的汇报里（建议改法、`render` 汇总、「表现不了」清单）。这一轮没跑过那个子 skill 时，汇报能从文件读到的部分，其余标明「在之前的 `/<子 skill>` 汇报里」。

用户提的是修改意见时，按那个子 skill 关口一节处理意见，改完再停在这个关口。用户说审过、做完上表最后一列之后，回到第 1 步：从哪里继续由 `status` 判断，已经做完的步骤它不会再给。
