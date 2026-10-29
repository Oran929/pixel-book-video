---
name: factcheck
description: 语义核对一期旁白稿：让一个独立的 subagent 只看旁白句和它引用的原文段落，逐句判定原文是否支持，写出期目录里的 factcheck.yaml。/script 写完稿后调用；手改旁白稿之后单独运行。
argument-hint: <期目录>
---

# /factcheck <期目录>

参数：`$ARGUMENTS`，形如 `books/<书>/chNN/epNN`。

- **输入**：期目录里的 `script.yaml` 和它引用的转换结果。
- **输出**：期目录里的 `factcheck.yaml`；格式、轮次和两条命令的行为以 README「语义核对」为准。
- **你是传话人，判定交给裁判。** 写稿的上下文倾向于认为自己写的是对的（ADR-0008），所以判定由一个全新的 subagent（**裁判**）做，它看到的只有 `factcheck-packet` 打印的材料。你原样转交材料、原样记下回答，不改动、不补充、不复核裁判的判定。

## 步骤

### 1. 生成材料

```sh
cd tools && uv run pixelbook factcheck-packet ../<期目录> > <scratchpad>/factcheck-packet.md
```

`<scratchpad>` 是会话的临时目录。退出码 1 时，文件里是检查报告：停下，把报告交还给调用者（`/script` 或用户），稿修好后再核对。

**完成**：退出码 0，材料文件已写出。

### 2. 交给裁判

用 Agent 工具启动一个**全新的** subagent（`general-purpose`；不用 `fork`，fork 会继承写稿的上下文）。prompt 是下面这段说明，`<材料>` 处换成材料文件的全文；除此之外不加任何东西：书名、大纲、画面、写稿思路、上一轮的判定都不给。

```text
你是一份中文讲解视频旁白的事实核对员。下面是旁白稿的全部旁白句（按播出顺序），每句后面附着它引用的原文段落。原文是一本书的中文译本。

只根据每句附带的原文段落判断，不读任何文件、不搜索，也不用你对这本书或这个领域的其他了解：原文段落里推不出的内容，即使在现实中是对的，也算没有依据。

旁白按字幕切成短句，一句话可能跨几行；用前后句理解指代和省略，但每句只判它自己说出的内容。

逐句给出判定：
- supported：这句说的每一点都能从它的原文段落得出。改写、压缩、换说法、概括都可以；不含实质主张的过渡句（如「先看第一点」）也算 supported。
- partial：主干有依据，但多出了原文没有的细节、例子、数字、因果或评价，或者把原文说得更绝对、更宽泛、更弱，或者漏掉了改变意思的限定。
- unsupported：主干在原文段落里找不到，或者和原文相反。

每句的 reason 用一句中文说明依据：supported 时指出对应的段落编号；partial 和 unsupported 时指出具体是哪部分没有依据。

只输出下面这个 YAML，按材料里的顺序，每个旁白句一条，不多不少，不加其他文字：

lines:
  - id: <旁白句 ID>
    verdict: supported | partial | unsupported
    reason: <一句话>

--- 材料 ---
<材料>
```

**完成**：裁判返回了一段 YAML。

### 3. 记下回答

把裁判的回答原样存成 `<scratchpad>/factcheck-answer.yaml`（只去掉包住它的 ```` ``` ```` 代码块标记），然后：

```sh
cd tools && uv run pixelbook factcheck-record ../<期目录> <scratchpad>/factcheck-answer.yaml
```

退出码 1 说明回答格式不对或和旁白稿对不上：回到第 2 步，把同一份 prompt 交给另一个全新的裁判，不自己补判、不手改回答。

**完成**：退出码 0，`factcheck.yaml` 已写出，命令打印了汇报。

### 4. 汇报

把 `factcheck-record` 打印的汇报原样转给调用者。单独运行时到此结束：`factcheck.yaml` 和旁白稿一起交给用户审，用户审过（关口 2）后两者一起提交。
