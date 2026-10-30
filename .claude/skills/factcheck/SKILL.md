---
name: factcheck
description: 语义核对一期旁白稿：让一个独立的 subagent 只看旁白句和它引用的原文段落，逐句判定原文是否支持，写出期目录里的 factcheck.yaml。/script 写完稿后调用；手改旁白稿之后单独运行。
argument-hint: <期目录>
---

# /factcheck <期目录>

参数：`$ARGUMENTS`，形如 `books/<书>/chNN/epNN`。

- **输入**：期目录里的 `script.yaml` 和它引用的转换结果。
- **输出**：期目录里的 `factcheck.yaml`；格式、轮次、prompt 的内容和两条命令的行为以 `docs/reference/factcheck.md`「语义核对」为准。
- **你是传话人，判定交给裁判。** 写稿的上下文倾向于认为自己写的是对的（ADR-0008），所以判定由一个全新的 subagent（**裁判**）做。给裁判的完整 prompt（说明、原文、旁白句、校验码）由 `pixelbook factcheck-prompt` 生成，你原样转交、原样记下回答，不改动、不补充、不复核裁判的判定。

## 步骤

### 1. 生成 prompt

```sh
cd tools && uv run pixelbook factcheck-prompt ../<期目录> > <scratchpad>/factcheck-prompt.md
```

`<scratchpad>` 是会话的临时目录。退出码 1 时，文件里是检查报告：停下，把报告交还给调用者（`/script` 或用户），稿修好后再核对。

**完成**：退出码 0，prompt 文件已写出，最后一行是 `校验码：fc-…`。

### 2. 交给裁判

读出 prompt 文件的全文，用 Agent 工具启动一个**全新的** subagent（`general-purpose`；不用 `fork`，fork 会继承写稿的上下文），`prompt` 参数就是这份全文，一字不改，前后不加任何东西：书名、大纲、画面、写稿思路、上一轮的判定都不给。

**完成**：裁判返回了一段 YAML，第一行是 `packet: fc-…`。

### 3. 记下回答

把裁判的回答原样存成 `<scratchpad>/factcheck-answer.yaml`（只去掉包住它的 ```` ``` ```` 代码块标记），然后：

```sh
cd tools && uv run pixelbook factcheck-record ../<期目录> <scratchpad>/factcheck-answer.yaml
```

用户在这次对话里说过旁白稿的改动是他改的或他同意的（`/script` 转达用户的决定也算），命令末尾加 `--user-edited`；没有用户这句话就不加。

退出码 1 时按报错处理，不自己补判、不手改回答：

- 写稿者只能拆句：和上一轮相比有改写（包括改了 `speech`）、新增或删除，用户没有授权。停下，把报错里的改动清单交还给调用者，由用户决定。

- 校验码缺失或不同：旁白稿在第 1 步之后改过，或裁判没收到完整的 prompt。回到第 1 步重新生成，交给新的裁判。
- 格式不对或和旁白稿对不上：回到第 2 步，把同一份 prompt 交给另一个全新的裁判。

**完成**：退出码 0，`factcheck.yaml` 已写出，命令打印了汇报。

### 4. 汇报

把 `factcheck-record` 打印的汇报原样转给调用者。单独运行时到此结束：`factcheck.yaml` 和旁白稿一起交给用户审，用户审过（关口 2）、定稿后两者一起提交（见 `/script` 第 7 步）。
