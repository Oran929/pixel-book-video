---
name: script
description: 按大纲写一期旁白稿（status draft），跑 pixelbook check 直到没有报错，调用 /factcheck，给不支持和部分支持的句子写好验证过的建议改法，停在人工关口 2 交给用户决定。
argument-hint: <期目录>
disable-model-invocation: true
---

# /script <期目录>

参数：`$ARGUMENTS`，形如 `books/<书>/chNN/epNN`。

- **输入**：同一章的大纲 `books/<书>/chNN/outline.yaml` 里和期目录同名的那一期（主题、`units`、段、核心观点），以及这一期覆盖的原文：转换结果 `books/<书>/chapters/chNN.md` 里本期范围内的编号段落。
- **输出**：`<期目录>/script.yaml`（`status: draft`）、`/factcheck` 写出的 `<期目录>/factcheck.yaml`，和给用户的建议改法（临时目录里的草稿副本，不改正式稿）。格式和全部机械规则以 `docs/reference/script.md`「旁白稿与检查」和 `docs/reference/factcheck.md`「语义核对」为准，由 `pixelbook check` 判定；这份 skill 只管写稿和改稿。
- 术语以 `GLOSSARY.md` 为准：期、主题、段、画面、旁白句、出处、大纲、核心观点。

## 防编造

旁白稿是讲解，不是创作。下面每条都适用于字幕 `text`、`speech` 和画面说明 `description`：

- **只来自原文**：每句只复述、压缩或引用它 `cite` 的段落，不加书里没有的例子、数据、结论、评价或类比，也不用对英文原版、其他版本或书外知识的了解来补充。
- **出处要够**：`cite` 列出这句话依赖的全部段落，一句概括了几段就列几段。裁判只看 `cite` 里的段落，漏列的依据等于没有依据。
- **用自己的话**：改写原文，尽量不用原文措辞；提示框标题、术语和专有名词（DRY、ETC、曳光弹）照用。
- **不念提示编号**：书里的「提示14」「提示15」对观众没有意义，字幕和 `speech` 只讲提示框的内容（可以照用 `提示N` 后面的标题），不写编号（阿拉伯数字和中文数字都不行）；`pixelbook check` 会报错。画面说明里可以写 `提示N` 指明是哪个提示框。
- **画面只用书里的术语**：`description` 里的概念、名字、物件都在本章原文出现过。`pixelbook check` 只能查出其中的拉丁字母词、引号里的词语和 `提示N`（`docs/reference/script.md`「旁白稿与检查」），中文概念和名字要你自己对照原文。

## 步骤

### 1. 准备

```sh
cd tools && uv run pixelbook outline ../books/<书>/chNN/outline.yaml
```

退出码 1，或输出的期里没有这一期时，停下告诉用户：旁白稿只按审过的大纲写（关口 1）。

`script.yaml` 已经存在时，先问用户是从头重写，还是按意见修改现有稿。从头重写时删掉旧的 `factcheck.yaml`，核对轮次从 1 重新算。

**完成**：大纲检查通过且有这一期；知道是新写还是修改。

### 2. 读

读本期的主题、各段、全部核心观点和它们的出处；再读本期 `units` 覆盖的每一个编号段落（拆分的单元只读 `from`–`to` 范围）。

**完成**：读过范围内每一个编号段落，每条观点都知道对应哪些段落。

### 3. 写稿

- `title` 抄大纲里这一期的 `topic`；`status: draft`。
- 段照大纲的段，顺序和标题照抄；按各段 `minutes` 分配字数（每分钟 250 字），全稿 1000–1500 字。
- 一段分成几个画面，画面换在话题转折处；`points` 标出画面讲到的观点。
- 一句话超过字幕长度就按意思切成几句，每句都有 `cite`；`speech` 只在朗读和字幕必须不同时写。
- ID 照 `docs/reference/script.md`「旁白稿与检查」里样例的写法：段 `s01`，画面 `s01-c01`，旁白句 `s01-l01`（段内连续编号）。

**完成**：`script.yaml` 已写出。

### 4. 机械检查

```sh
cd tools && uv run pixelbook check ../<期目录>/script.yaml
```

按报错改稿再跑，直到退出码 0；只改旁白稿，不改大纲和检查。再看警告：

- 照搬：按防编造规则改写，除非相同的片段是术语或专有名词（紧挨着的提示框标题和小标题不会报）；
- 范围：只在确实需要引用别处时保留；
- 画面说明：报出的词语在本章原文里没有，改成原文里的说法。

输出开头的各段估算只是参考：大纲的 `minutes` 定稿时跟着稿子改（第 6 步），写稿时按第 3 步分配字数即可。

保留的警告记下理由，交给用户时说明。

**完成**：退出码 0，每条剩下的警告都有保留理由。

### 5. 语义核对

用 Skill 工具调用 `/factcheck <期目录>`，读它转来的 `factcheck-record` 汇报。

**第一轮核对之后，正式稿里你自己能做的改动只有拆句**：把一句切成连续的几句，字幕依次接起来和原句一字不差、出处不变，原句有 `speech` 时也把它切开（几句的 `speech` 接起来等于原句的），没有时拆出的句子也不写，后面的 ID 依次改号。改 `speech` 和改字幕一样算改写。改写、新增、删除句子都由用户决定；`factcheck-record` 会拒绝记录这样的稿，`--user-edited` 只有用户能授权。

**完成**：拿到 `factcheck-record` 的汇报；正式稿除了拆句，和核对时一样。

### 6. 写建议改法

汇报里每个不支持、部分支持的句子，都写一条建议改法，先验证再交给用户：

1. 把正式稿复制到会话的临时目录（`<scratchpad>/script.suggested.yaml`），在副本里按理由改写：回到出处推得出的内容，或补上漏列的出处；推不出的说法建议删掉。一句改长了就照第 3 步切句。
2. 检查副本：

   ```sh
   cd tools && uv run pixelbook check <scratchpad>/script.suggested.yaml --episode ../<期目录>
   ```

   改到退出码 0，改过的句子没有新的照搬、范围警告（第 4 步的处理办法同样适用）。副本不查 `factcheck.yaml`。

**完成**：每个不支持、部分支持的句子都有一条建议改法，副本的检查退出码 0；正式稿没动。

### 7. 交给用户（人工关口 2）

用中文汇报，然后停下等用户审。旁白稿和 `factcheck.yaml` 都不提交，`status` 保持 `draft`。

- **置顶**：不支持的句子（ID、字幕、理由）和建议改法；
- 部分支持的句子和建议改法；
- `factcheck-record` 汇报里的改动清单，原样附上；
- `pixelbook check` 输出开头的估算时长（全稿和每段，对照大纲），剩下的警告和保留理由；
- 核对了几轮。

用户逐句决定改法。用户提的修改意见如果是规则问题（怎么写、怎么切句、怎么引用），先改这份 skill，再按改过的 skill 改稿。按用户的决定改正式稿（或用户自己改）之后，跑第 4 步，再调用 `/factcheck <期目录>`，并告诉它这次的改动是用户授权的（记录时加 `--user-edited`）；然后回到第 6 步。

用户说定稿时：

```sh
cd tools && uv run pixelbook sync-minutes ../<期目录>/script.yaml
uv run pixelbook outline ../books/<书>/chNN/outline.yaml
```

`sync-minutes` 把各段估算（取到 0.25 分钟；取整后总和出了 4:00–6:00 时它会调整一段，不用你改）写回大纲里这一期的 `minutes`。再把 `status` 改成 `final`，跑第 4 步的 `pixelbook check`（定稿时大纲的 `minutes` 和估算对不上会报错），都通过后旁白稿、`factcheck.yaml` 和大纲一起提交。
