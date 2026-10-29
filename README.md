# 像素风书籍讲解视频

把书的一章改编成约 5 分钟、像素风、配音与画面同步的讲解视频。术语见 `GLOSSARY.md`，决策见 `docs/adr/`。

## 仓库结构

```
pronunciation.yaml   读音表（全频道共用）
voice.yaml           项目默认音色配置（由 `pixelbook choose-voice` 写入）
voices/              音色试听方案（audition*.yaml）、选定的参考音频、备用音色配置（如 yujie.yaml）
books/<书>/          书配置、原书（不提交）、转换出的章（不提交）、锁定音色、配音缓存；书 → 章（大纲）→ 期
tools/               Python 工具（uv 管理）：旁白稿 → 配音 → 合成清单
video/               Remotion 项目（npm 管理）：合成清单 + 分镜 → MP4
character/           频道形象设定图原图（Q.png、M.png）和裁图脚本
```

## 安装

需要 [uv](https://docs.astral.sh/uv/)、Node.js 和 ffmpeg（`brew install uv node ffmpeg`）。

```sh
make install
```

`mlx-audio`（配音和语音识别复核）只在 macOS 上安装；在别的系统上 `make install` 不装它，`make check` 照常能跑，但配音和复核用不了。

## 配音模型

配音用本机的 Qwen3-TTS 1.7B bf16，通过 mlx-audio 运行（ADR-0002），需要 Apple Silicon。模型第一次使用时会自动从 Hugging Face 下载到 `~/.cache/huggingface/`；也可以先手动下载（每个约 4 GB）：

```sh
cd tools
uv run hf download mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16         # 正式配音：参考音频克隆
uv run hf download mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16  # 试听：预设音色
uv run hf download mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16  # 试听：设计音色
```

首次运行会多花几十秒加载模型，之后每句话只算生成时间。

配音后的语音识别复核（见下文"语音识别复核"）也用 mlx-audio 的本地模型，按 `verification.yaml` 的 `asr` 选一个，同样第一次使用时自动下载：

```sh
uv run hf download Qwen/Qwen3-ASR-1.7B                             # asr: qwen3-asr（约 4 GB）
uv run hf download mlx-community/whisper-large-v3-turbo-asr-fp16   # asr: whisper（约 1.6 GB）
```

### 选定默认音色

```sh
cd tools
uv run pixelbook audition             # 按 voices/audition.yaml 生成试听音频到 out/audition/
uv run pixelbook choose-voice <名字>  # 把选中的音色写进 voice.yaml
```

`audition` 会为每个候选音色生成 `<名字>-<句号>.wav`，并打印每句的生成耗时、音频时长、峰值内存，以及一期（约 100 句）的耗时估算，完整数据在 `out/audition/report.json`。设计音色另外生成一句 `<名字>-ref.wav`：如果选中的是设计音色，`choose-voice` 会把这一句复制到 `voices/<名字>.wav` 作为参考音频，`voice.yaml` 改用 Base 模型克隆它。所以选之前也要听一下这句参考句。选中预设音色时，`voice.yaml` 直接记录模型和音色名。`voice.yaml` 里的 `ref_audio` 是相对仓库根目录的路径；`voice.yaml` 和参考音频都要提交。

## 原书转换

原书放在书目录里，命名为 `source.epub`（不提交）。一条命令把它机械地转成每章一份带段落编号的 Markdown（ADR-0007），旁白稿和大纲的出处都引用这里的编号：

```sh
cd tools
uv run pixelbook convert ../books/pragmatic-programmer   # 写出 books/pragmatic-programmer/chapters/ch01.md … ch09.md
```

转换直接解析 EPUB 里的 XHTML（按 spine 顺序），不调用 pandoc，也不经过模型；同一份 EPUB 每次转出的结果逐字节相同。`chapters/` 是版权内容，不提交，需要时重新转换。不要手改转换结果。

- **分章**：按目录（NCX）里匹配「第 N 章」的顶层条目切分，一章到目录里下一个顶层条目为止，写成 `chNN.md`。前言、赞誉、跋、练习参考答案等其他顶层条目不转换。
- **编号段落**：每个正文段落、列表项、引文、图片各占一行，以编号开头：`ch02-¶017 正文……`。每章从 `¶001` 起，三位数补零。引文在编号后面加 `>`（`ch02-¶040 > 在一个系统中……`）；图片写成占位符 `ch02-¶051 [图 images/00004.jpeg]`，有图题时接在占位符后面。
- **标题（不编号）**：章标题 `#`，单元标题 `##`（如 `## 9　DRY——邪恶的重复`），提示框标题 `###`（如 `### 提示15　DRY——不要重复自己`），只有一段加粗文字的小标题 `####`（如 `#### 挑战`）。各单元末尾「相关部分」「挑战」「练习」下面的内容照常是编号段落。
- **脚注**：正文里的脚注标记保留成文字（如 `OpenAPI[5]`）；脚注按出现顺序追加在章末的分隔线 `---` 之后，和正文连续编号（`ch02-¶402 [5]网址参见……`）。
- **文字**：加粗、斜体只保留文字，上标前面加 `^`（`C^n`），连续空白合并成一个空格。
- **报错**：遇到规则覆盖不到的元素（如表格、不认识的 `div`、夹在文字里的图片）就停下，写明文件和元素，不静默丢弃。这时先在 `tools/src/pixelbook/convert.py` 里补上规则。

## 大纲

一章一份大纲 `books/<书>/chNN/outline.yaml`（提交），章目录名和转换结果 `chapters/chNN.md` 同名。大纲写这一章拆成哪几期、每期讲什么、带出处的核心观点，审过之后才写旁白稿。

```yaml
chapter: 2                       # 章号，必须和章目录 chNN 一致
episodes:
  - id: ep01                     # 期 ID，ep01 起，两位数补零；也是期目录名
    topic: 优秀设计与 DRY         # 主题：概括这一期覆盖的单元，显示在画面左上角；旁白稿的 title 必须等于它
    units:                       # 覆盖的单元，按单元号写
      - 8
      - unit: 9                  # 长单元拆成两期时，写明这一期覆盖的段落范围（含两端）
        from: ch02-¶034
        to: ch02-¶060
    segments:                    # 段：4–6 段，每段的标题和预计分钟数
      - title: 开场
        minutes: 0.5
      - title: ETC
        minutes: 1.5
      # ……
    points:                      # 核心观点
      - id: p01                  # 观点 ID，整份大纲里唯一；旁白稿画面的 points 引用它
        text: 好的设计比坏的设计更容易变更
        cite: ch02-¶012          # 出处：一个段落编号，或编号列表（[ch02-¶040, ch02-¶041]），不支持范围
```

- **`units`**：单元号是原书的单元编号（转换结果里的 `## 9　DRY——邪恶的重复`），一个单元覆盖它的标题到下一个单元标题（或章末的 `---`）之间的编号段落。写 `{unit, from, to}` 时 `from`、`to` 都必须是这个单元里的段落，且 `from` 不在 `to` 后面。
- **`minutes`**：正数，可以是小数（`1.5` 是 1 分 30 秒）。写大纲时是计划；旁白稿定稿时改成按稿子估算的时长（`pixelbook sync-minutes`，见「旁白稿与检查」），以定稿为准。
- **`cite`**：写法和旁白稿相同。

检查（只检查，不生成任何东西）：

```sh
cd tools
uv run pixelbook outline ../books/pragmatic-programmer/ch02/outline.yaml
```

有报错时退出码 1，否则 0（只有警告也是 0）。先查格式（缺字段、多出不认识的字段、类型不对、期 ID 不是 `epNN`、`cite` 写成范围），格式错时报第一处；格式对了再一次列出下面所有报错，每条指出哪一期、哪个字段：

- `chapter` 和章目录不一致；
- 期 ID 重复，同一期里段标题重复，观点 ID 在整份大纲里重复；
- 一期的段数不在 4–6 内；
- 一期各段 `minutes` 的总和不在 4:00–6:00 内（含两端）；
- `units` 里的单元在转换结果里没有，或段落范围不在这个单元里、首尾颠倒；
- 覆盖整章：每个单元的每个编号段落要恰好属于一期，期（和每期 `units` 里的各项）按原文顺序排列。没被覆盖的、被两期覆盖的段落按连续范围列出。章首导语和章末脚注不属于任何单元，不要求覆盖。`units` 本身有错时这条不查；
- `cite` 里的编号在这一章的转换结果里不存在，或只引用了图片段；
- `cite` 里的编号不在本期 `units` 覆盖的单元或段落范围里。章首导语不属于任何一期；章末脚注算在它的标记 `[N]` 所在的段落（标记在标题里时，算标题后面的第一个编号段落）。

警告（不影响退出码）：照搬原文，观点 `text` 和它 `cite` 引用的任一文字段有 12 个字以上连续相同，口径和旁白稿检查的照搬警告相同（见「旁白稿与检查」）。术语、专有名词（如一串工具名 RSpec、Cucumber）有时只能照用，看一眼确认就行。

转换结果不存在时先跑 `pixelbook convert`。

## 从旁白稿到 MP4

旁白稿放在 `books/<书>/<章>/<期>/script.yaml`（样例：`books/sample/ch01/ep01/script.yaml`）。顶层的 `title` 必填，是这一期的主题，显示在画面左上角（样例里是示例值「读一本8bit像素书」），缺了或为空时 `voice` 报错。

### 旁白稿与检查

```yaml
title: 读一本8bit像素书          # 主题：等于大纲里这一期的 topic，显示在画面左上角
status: final                    # 必填：draft（写稿中）或 final（过了关口 2 才改）
segments:
  - id: s01
    title: 开场
    scenes:
      - id: s01-c01
        description: 一个方块落下
        points: [p01]            # 可选：这个画面讲到的大纲观点 ID
        lines:
          - id: s01-l01
            text: 第一条原则叫 DRY。      # 字幕，去掉空白后不超过 20 字
            speech: 第一条原则叫 D R Y。  # 可选：朗读文本
            cite: ch02-¶040               # 出处：一个段落编号
          - id: s01-l02
            text: 意思是不要重复你自己。
            cite: [ch02-¶040, ch02-¶041]  # 或编号列表；不支持范围
```

- **`title`**：主题只在大纲里改。旁白稿对应同一章 `outline.yaml` 里和期目录同名的那一期（`ch02/ep01/` 对应大纲里的 `ep01`），`title` 必须等于它的 `topic`。要改主题，先改大纲，再重新跑 `/script` 同步，不单独改旁白稿的 `title`。
- **`points`**：画面的可选字段，观点 ID 的列表（大纲里本期 `points` 的 `id`）。本期的每条观点都要至少被一个画面讲到，画面也只能引用本期的观点。
- **`cite`**：一个段落编号字符串，或编号列表（写法和大纲相同）。不支持范围（`ch02-¶040–¶045` 是格式错误）。出处只给检查和语义核对用，不进合成清单，配音和 Remotion 不受影响。
- **`status`**：`draft` 或 `final`。`voice` 和 `render` 遇到 `draft` 拒绝运行；确实要给草稿配音（比如先听一遍），加 `--draft`。`render --draft` 把它透传给配音一步。

一条命令跑完旁白稿的全部机械检查（只检查，不生成任何东西）：

```sh
cd tools
uv run pixelbook check ../books/pragmatic-programmer/ch02/ep01/script.yaml
```

输出先是估算时长（不管通过与否都打印）：全稿的字数和估算时长，再每段一行，写出这一段的字数、估算时长和大纲给它的时长，例如

```
估算时长：4:46（1190 字，按 250 字/分钟，应该在 4:00–6:00 内）
  s01 好设计就是容易变更：212 字，估算 0:51，大纲 1:00（1 分钟）
  s02 ETC 是价值观念：173 字，估算 0:42，大纲 1:00（1 分钟）
```

段和大纲对不上（见下面的报错）时这一列写「段对不上，不对照」。各段估算和大纲差多少不报警告，只在这张表里看；定稿时大纲跟着稿子改（见下面的 `sync-minutes`）。然后分成「报错」和「警告」两块，每条以旁白句 ID 开头（`points` 和画面说明的问题用画面 ID，各段时长的问题用段 ID，不属于某一句的问题记在「旁白稿」下），最后一行写通过与否。**退出码只受报错影响**：有报错为 1，只有警告为 0。先查格式（和 `voice` 相同：缺字段、多出不认识的字段、ID 重复、字幕超过 20 字、`status` 不是 `draft`/`final`、`cite` 写法不对），格式错时报第一处；格式对了再一次列出下面所有报错：

- `cite` 里的编号在这一章的转换结果（`chapters/chNN.md`）里不存在；
- 一句的 `cite` 只引用了图片段（`[图 …]`，带图题的也算）；
- 按 250 字/分钟估算的时长不在 4:00–6:00 内（含两端）。字数口径和字幕相同：只数 `text`、去掉空白，`speech` 不算；
- 找不到大纲、大纲格式不对（先用 `pixelbook outline` 修好），或大纲里没有这一期；这时下面几条对照大纲的检查不跑；
- `title` 不等于大纲里这一期的 `topic`；
- 段和大纲里这一期的段不是一一对应：个数、顺序、标题要都相同（大纲的 `segments` 就是旁白稿的段）；
- 本期大纲里有观点没被任何画面的 `points` 讲到，或某个画面的 `points` 引用了本期大纲里没有的观点（包括别的期的观点）；
- 一条观点被画面讲到了，但讲到它的所有画面里没有一句的 `cite` 引用了这条观点的任一出处段落（画面标了 `points`，内容却没讲这条观点）；
- `status: final` 时，大纲给某段的 `minutes` 不等于这一段的估算分钟数取到 0.25 分钟（记在段 ID 下）：跑 `pixelbook sync-minutes` 把估算写回大纲。草稿不查。
- 期目录里有 `factcheck.yaml`（见下文「语义核对」）时：它格式不对（报第一处，记在「旁白稿」下），或旁白稿里有句子没有判定、核对之后改过字幕或出处（记在那一句下），或它判定了旁白稿里没有的句子（记在它写的句子 ID 下）。没有 `factcheck.yaml` 时不检查。

警告（不影响退出码）：

- `cite` 里的编号不在本期 `units` 覆盖的单元或段落范围里（章首导语不属于任何单元，算在范围外；章末脚注和大纲检查一样，看它的标记所在的段落）。偶尔引用别处的定义可以，审稿时看一眼；
- 照搬原文：字幕 `text` 和它 `cite` 引用的任一文字段，两边都去掉空白和标点后，有 12 个字以上连续相同。警告里写出相同的片段。标题可以照用：字幕里照用了紧挨着这一段的提示框标题（`提示N` 后面的部分）或 `####` 小标题时，那一截不参与比较；
- 画面说明 `description` 里能机械提取的词语在本章转换结果（所有标题和编号段落，图片段只算图题）里没有出现，记在画面 ID 下。

画面说明的检查只是近似，**机械检查的**是这三类词语：

- 拉丁字母词（`DRY`、`Bug`、`Schema`、`C++`）：按整词找，不分大小写，`DRYER` 不算出现了 `DRY`；
- 引号和书名号里的词语（「」“”"" 『』《》）：两边都去掉空白和标点后，要在原文里连续出现；
- `提示N`：要有这个编号的提示框。

**仍要人看的**：其他中文概念、人名、物件（「柯克船长」「知识胶囊」「路障」）提取不出来，不查；词语在本章出现过，不代表这个画面用得对（场景、动作、关系是不是原文的意思）；只查本章，不查是不是在本期范围或这句的出处里。审稿时逐个画面看一遍。

**检查草稿副本**：给用户的建议改法先写进期目录外的一份副本（比如会话的临时目录），用 `--episode` 按这一期的大纲和原文检查。副本还没核对过，所以不查 `factcheck.yaml`，其余规则全都照查：

```sh
uv run pixelbook check <副本.yaml> --episode ../books/pragmatic-programmer/ch02/ep01
```

**大纲的时长跟着定稿走**：段的 `minutes` 写大纲时只是计划，稿子写完以后以稿子为准。定稿前（或者想看看）运行

```sh
uv run pixelbook sync-minutes ../books/pragmatic-programmer/ch02/ep01/script.yaml
```

它把每段的估算分钟数（字数 ÷ 250，取到 0.25 分钟）写回同一章大纲里这一期的 `segments[].minutes`，打印每段改前改后的值；只改这几个数，注释、别的期原样保留。段和大纲对不上，或取整后的总和不在 4:00–6:00 内（大纲检查会报错）时拒绝、不写文件。改完的大纲要照样通过 `pixelbook outline`。

章目录名必须是 `chNN`，转换结果不存在时先跑 `pixelbook convert`。样例旁白稿的出处不指向真实原文（样例书没有转换结果），不用 `check` 检查。

### 语义核对

机械检查通过后，`/factcheck <期目录>` 让一个独立的 subagent（裁判）只看每个旁白句和它 `cite` 引用的原文段落（不看大纲、画面说明和写稿思路），逐句判定原文是否支持，结果写进期目录里的 `factcheck.yaml`（提交）。`/script <期目录>` 写完稿会自动调用它；手改旁白稿之后也可以单独跑。不支持、部分支持的句子不会被自动改写：`/script` 给每句写一条用 `check --episode` 验证过的建议改法，交给你逐句决定，你改完之后再核对一轮。两个 skill 在 `.claude/skills/script/`、`.claude/skills/factcheck/`；判定标准（给裁判的说明）在 `tools/src/pixelbook/judge.py` 的 `INSTRUCTIONS` 里，由命令生成，防编造的写稿规则以 `/script` 为准（ADR-0008）。能机械判断的部分都在下面两条命令和 `pixelbook check` 里，skill 只跑命令、原样转交、写稿和判定。

```sh
cd tools
# 1. 给裁判的完整 prompt：说明、引用到的原文段落、旁白句、校验码；skill 原样交给裁判，不加不改
uv run pixelbook factcheck-prompt ../books/pragmatic-programmer/ch02/ep01
# 2. 把裁判的回答（packet：校验码；lines：id、verdict、reason）记进 factcheck.yaml
uv run pixelbook factcheck-record ../books/pragmatic-programmer/ch02/ep01 <裁判的回答.yaml>
```

- **`factcheck-prompt`**：旁白稿除 `factcheck.yaml` 以外还有任何报错（即 `check` 的报错去掉核对结果那几条）时拒绝，打印检查报告、退出码 1。旧的 `factcheck.yaml` 对不上不拦，这一轮就是要重新核对。prompt 分四块：
  1. 给裁判的说明（判定标准、每句只按它自己的出处判断、回答格式）；
  2. `--- 原文段落 ---`：全稿引用到的段落按原文顺序各列一次（`ch02-¶040 ……`）。提示框标题（`### 提示N　…`）和 `####` 小标题不是编号段落、引用不到，所以引用了紧挨在它们前面或后面的那一段时，按原文位置在这一段前后加一行 `提示框：提示15　DRY——不要重复自己` 或 `小标题：DRY 不限于编码`（脚注标记去掉；相邻两段共用的只列一次）；两段在原文里不相邻时中间写一行 `……`；
  3. `--- 旁白句 ---`：按顺序每句两行，`s05-l05（出处：ch02-¶039）` 和 `旁白：……`，只写编号，不重复原文；
  4. `--- 校验码 ---`：最后一行 `校验码：fc-…`，是前面全部文字的 SHA-256 前 12 位。旁白稿或转换结果一改，校验码就变。

  没有主题、段标题、画面说明、`points` 和 `speech`。
- **`factcheck-record`**：先比校验码：回答顶层的 `packet` 要等于用当前旁白稿重新生成的 prompt 的校验码，缺了或不同都拒绝、不写文件（裁判没收到完整的 prompt，或出题之后改过稿或原文），要重新生成 prompt 交给新的裁判。校验码放在 prompt 末尾，能发现被截断、过期的 prompt；不能证明中间没人改过，所以 skill 必须原样转交。再要求回答和旁白稿逐句对应（同样的句子 ID、同样的顺序、不多不少），否则报出第一处对不上的位置、不写文件，要把同一份 prompt 交给新的裁判。对得上时整份覆盖 `factcheck.yaml`：`round` 是旧文件的 `round` + 1（没有旧文件时为 1），每句抄下当前的字幕和出处。最后打印汇报：各判定的句数，**改动清单**，先列不支持、再列部分支持的句子（ID、字幕、理由）。旧文件格式不对时拒绝，算不出轮次；从头核对就先删掉它。
- **核对之后写稿者只能拆句**：已经有 `factcheck.yaml`（上一轮）时，`factcheck-record` 先把当前旁白稿和上一轮记下的每句字幕、出处比较。只拆了句时照常记录：上一轮的一句变成当前连续的几句，几句的字幕依次接起来（去掉空白后）等于原句、出处都和原句相同；随之改了编号的句子不算改动。有改写（字幕或出处变了）、新增、删除时拒绝、不写文件，列出这些改动：这些都要用户决定。用户改过稿、或明确同意了这些改动之后，加 `--user-edited` 才记录；这个开关只有用户能授权（`/script`、`/factcheck` 不自己加）。
- **改动清单**：和上一轮比，按「拆分（旧 ID → 新 ID）、改写（旧字幕 → 新字幕、旧出处 → 新出处）、新增、删除、改了编号（连续的合成一段，如 `s05-l06–s05-l22 → s05-l07–s05-l23`）」列出；没有上一轮时写「第 1 轮，没有上一轮可比」，没变时写「没有改动」。字幕、出处都相同的句子按顺序对齐，所以两句一字不差时可能对错位置，只影响清单的写法。

```yaml
round: 1                         # 第几轮核对，正整数，从 1 起
lines:                           # 每个旁白句一条，按旁白稿顺序
  - id: s01-l01                  # 旁白句 ID
    text: 第一条原则叫 DRY。       # 核对时的字幕，由 factcheck-record 抄下
    cite: [ch02-¶040]            # 核对时的出处，同上
    verdict: supported           # supported（支持）/ partial（部分支持）/ unsupported（不支持）
    reason: ¶040 给出了 DRY 的定义，旁白是它的压缩复述。   # 一句话理由
```

- 只认这五个字段和顶层的 `round`、`lines`；多出或缺少字段、`verdict` 取值不对、同一句出现两次，都是格式错误。
- `pixelbook check` 核对格式和逐句对应，并比较每句的 `text`、`cite` 和旁白稿当前的是否相同：核对之后改过的句子报错，要重新跑 `/factcheck`。判定结果不影响退出码，有 `unsupported` 也照样通过；判定由 `/script` 汇报，你在关口 2 审。

### 完整步骤

1. 写旁白稿 `script.yaml`（和可选的分镜 `storyboard.json`，见下文"分镜"）。
2. 一键出片：

   ```sh
   cd tools
   uv run pixelbook render ../books/sample/ch01/ep01/script.yaml   # 默认写到 out/sample-ch01-ep01.mp4
   ```

   依次运行四步，任何一步失败就停下，打印"第几步「哪一步」失败：原因"并以退出码 1 结束：

   | 步 | 做什么 | 常见的失败 |
   | --- | --- | --- |
   | 1 配音 | 同 `pixelbook voice`：定稿状态守卫、新术语检查、音色锁定守卫、缺字检查、逐句配音与复核，复制到 `video/public/episode/` | 旁白稿是 `draft`、新术语、音色和锁定不一致、缺字、配置文件写错 |
   | 2 时间轴 | 同 `npm run timeline`：校验分镜（含组件触发帧是否落在画面里），写出 `timeline.json` 和 `segments.txt` | 分镜不合格 |
   | 3 渲染 | `remotion render Episode`（只渲染成片，不渲染风格样张） | Remotion 报错（附上输出的最后几行） |
   | 4 核对时长 | 用 ffprobe 数 MP4 **视频流**的帧数，和 `timeline.json` 的总帧数比，相差超过一帧就算失败 | — |

   全部通过后打印汇总报告：MP4 路径、帧数、总时长和 4:00–6:00 的判断、打点时间表位置、复核未通过的句子（需要试听）、靠拼音通过的句子（只列出备查）。**复核未通过和总时长超出范围不算失败**，只列在汇总里。

   `--out <路径>` 改输出位置；`--revoice` 同 `voice --revoice`（音色和书的锁定音色不一致、确认整本书换音色时用）；`--draft` 同 `voice --draft`（旁白稿还是 `status: draft` 时放行）。

3. 看汇总报告：试听复核未通过的句子，读错了就删缓存再跑一遍；看 MP4。改了分镜只要再跑一遍 `render`，配音全部命中缓存，不会重新生成。

分步运行（排查某一步时用）：

```sh
cd tools
uv run pixelbook voice ../books/sample/ch01/ep01/script.yaml   # 逐句配音，生成合成清单
cd ../video
npm run timeline -- ../books/sample/ch01/ep01                   # 时间轴、打点时间表、总时长
npm run render -- ../out/sample-ch01-ep01.mp4                  # 渲染 MP4
```

`voice` 先看定稿状态（`status: draft` 时拒绝，加 `--draft` 放行），再按读音表检查新术语（见下），没有新术语才用这本书的音色（见下文“书的音色与锁定”）逐句配音，写出期目录里的合成清单 `episode.json`，再清空 `video/public/episode/`，把每句 wav 和合成清单复制进去。Remotion 只读 `video/public/episode/episode.json`。

每句配音缓存在 `books/<书>/cache/tts/<指纹>.wav`（不提交），指纹由朗读文本和音色指纹算出；音色指纹包括模型、参考音频的**文件内容**、参考文本、生成参数和引擎自身的设置（如参考音频补的静音），不包括随机种子。所以再次运行时只有改过的句子会重新生成，改了音色设置或换了参考音频的内容就全部重新生成。每个 wav 旁边的 `<指纹>.json` 记录生成信息。缓存可以随时删掉，删了就整期重新生成。

### 语音识别复核

每句配音生成后，都用本地语音识别模型转回文字，和**朗读文本**（读音替换之后的文本，或手写的 `speech`）对比，不和字幕文本对比。对比前两边都做同样的规范化：统一全角半角、繁体转简体、中文数字转阿拉伯数字（`第二章` → `第2章`）、英文转小写，再去掉标点和空白。

复核分两步，只识别一次：

1. 先比字：字符差异率 = 编辑距离 ÷ 朗读文本的字数，不超过阈值就通过。
2. 比字不通过，再把两边（规范化之后）转成不带声调的拼音比：每个汉字一个音节，英文字母和数字不转、每个字符算一个单位，拼音差异率不超过同一个阈值也算通过。识别模型把“它”听成“他”这类同音字就靠这一步通过；“写”读成“选”这类读成别的音的，两步都不通过。
3. 两步都不通过，这一版才算复核不通过。

设置在仓库根目录的 `verification.yaml`：识别模型 `asr`（`qwen3-asr` 或 `whisper`）、阈值 `max_diff_rate`（字符和拼音两步共用，差异率超过它就算这一步不通过）、重试次数 `max_retries`。不通过的句子重新生成，直到通过或用完重试次数；用完仍不通过，就用差异率最低的一版，照常进合成清单，并列进期目录里的检查报告 `report.json` 的 `asr_failures`（字幕文本、朗读文本、识别结果、字符差异率、拼音差异率、缓存文件），`voice` 也会打印出来。比字不通过、靠拼音通过的句子单独列在 `asr_pinyin_passes`，方便查同音字；它们算通过，不用处理。复核结果写在缓存旁边的 `<指纹>.json` 里（每一版的字符差异率 `diff_rate`、拼音差异率 `pinyin_diff_rate`——比字就通过时不算拼音，记为 `null`——和靠哪一步通过 `passed_by`：`chars`、`pinyin` 或 `null`）：缓存命中的句子不再生成、不再识别，没通过的句子每次运行都继续列出。听过之后确实读错了，删掉报告里那个缓存 wav 再运行 `voice` 就会重新生成；是识别错了就不用管。

改 `verification.yaml` 不影响声音，不会被音色锁定拦下，也不会让已缓存的句子重新复核。改成两步复核之前缓存的句子没有拼音结果，照常命中，按当时的结果列出；想用新规则重新复核，删掉它的缓存。

### 缺字检查

`voice` 还检查字幕文本里的每个字在像素字体（`video/public/fonts/` 里的 Fusion Pixel）里有没有字形：缺字时浏览器会换成系统字体，画面上混进一个不是像素风的字。左上角的主题 `title` 也一样检查。缺的字列进检查报告的 `missing_glyphs`（旁白句 `id` 和字 `char`；主题里缺的字，`id` 记作 `title`），`voice` 打印出来并以非零码退出。这项检查在配音之前做：有缺字就不配音，合成清单、`video/public/episode/` 和锁定音色都不动，检查报告里只有 `missing_glyphs` 一项。改写那句字幕（或者换字体）后再配音。空白不检查。

只想重新复制合成清单和分镜、不重新配音时（比如改了分镜），用 `uv run pixelbook stage ../books/sample/ch01/ep01`。

### 书的音色与锁定

书配置 `books/<书>/book.yaml`（提交）写这本书的书名 `title`、作者 `author`、出版社 `publisher`（写简介时照着写，都可以省略，写了就不能为空），以及可选的音色覆盖 `voice`。

书的音色就是项目默认音色 `voice.yaml`，除非书配置 `book.yaml` 覆盖它。覆盖的写法是引用一份音色配置文件（相对仓库根目录，格式和 `voice.yaml` 相同）：

```yaml
voice: voices/yujie.yaml
```

一本书第一次正式配音成功后，`voice` 把解析出的实际音色写进 `books/<书>/voice.lock`（提交到 git）：完整的音色设置，加上参考音频**内容**的 sha256。之后每次配音前都会比较当前解析出的音色和锁定音色，只要有一项不同（改了 `voice.yaml`、改了书的覆盖、或者参考音频内容变了）就拒绝运行，列出每一项的锁定值和当前值。这时二选一：

- 把音色改回锁定值；
- 确认整本书换音色：`uv run pixelbook voice <旁白稿> --revoice`。锁定会更新，这一期全部按新音色重新生成；这本书已经配过的其他期也要各自再运行一次 `voice`。

引擎自身的设置（如参考音频补的静音）和随机种子不进锁定，改了不会被拦下，只是缓存会重新生成。`terms` 这类试听命令用书的音色，但不经过守卫，也不写锁定。

### 读音表与新术语

`pronunciation.yaml` 是全频道共用的读音表（术语 → 朗读写法）。配音时，字幕文本里的术语按读音表替换成朗读文本（最长的术语优先，区分大小写）；旁白句手写了 `speech` 时以手写的为准。

字幕文本里由英文字母、数字、ASCII 符号组成的片段（如 `KV Cache`、`C++`、`I/O`），扣掉读音表里的术语后还剩下的，就是新术语；纯数字（`30`、`3.5`、`80%`、`1,000`）和手写了 `speech` 的句子不算。只要有新术语，`voice` 就拒绝配音，并列出每个术语出现在哪些旁白句。这时：

```sh
cd tools
uv run pixelbook terms ../books/sample/ch01/ep01/script.yaml   # 每个新术语一段试听音频，在 out/terms/
```

听完把读法写进 `pronunciation.yaml`。读法没问题的也要登记成原样不变的条目（如 `DRY: DRY`），表示"已确认"。

### 分镜

每期可以有一份分镜 `books/<书>/<章>/<期>/storyboard.json`（提交到 git），写每个画面用哪些组件、在哪句旁白出现，不写绝对时间。`voice` 和 `stage` 把它复制到 `video/public/episode/`；没有分镜时照常渲染，只有字幕。

```json
{
  "scenes": [
    {
      "scene": "s01-c02",
      "components": [{ "id": "dry", "component": "PixelBlock", "props": { "label": "DRY" } }],
      "triggers": [
        { "target": "dry", "line": "s01-l03", "offset": 1.2, "action": "enter", "animation": "slide" }
      ]
    }
  ],
  "pauses": [{ "after": "s01-l04", "seconds": 1.2 }]
}
```

- `scene`：合成清单里的画面 ID。`components`：本画面用的组件，`id` 是本画面里的名字，`component` 是组件名，`props` 按该组件的参数格式校验。新组件要登记两处：参数格式在 `video/src/components/schemas.ts`（不含 JSX，时间轴导出命令在 Node 里也要用它校验分镜），实现在 `video/src/components/registry.ts`；少登记一处，类型检查会报错。
- `triggers`：每个组件恰好一个 `enter`，`animation` 是 `fade`（淡入）或 `slide`（落下）。`line` 必须是本画面的旁白句。触发帧 = 这句的开始帧 + `offset` 秒 × 帧率，四舍五入到整帧；`offset` 可以为负，但触发帧必须落在本画面之内，否则渲染前报错。组件从触发帧显示到画面结束（下一个画面的第一句开始）。
- `pauses`：覆盖 `after` 这句之后的停顿（秒，≥ 0），优先于默认规则（句间 0.3 秒、换画面 0.8 秒）。

分镜在 Remotion 读取时校验，出错时报出第几个画面、第几个组件或触发、哪个字段。

### 时间轴、打点时间表与试听音轨

停顿规则只在 TypeScript 的时间轴函数里（`video/src/episode/timeline.ts`）。想听逐句配音按停顿排好后的整体效果，先导出时间轴，再拼一条试听音轨（不是正式产物，渲染时 Remotion 仍逐句放音频）：

```sh
cd video
npm run timeline -- ../books/sample/ch01/ep01        # 写出期目录里的 timeline.json 和 segments.txt
cd ../tools
uv run pixelbook mix ../books/sample/ch01/ep01/timeline.json   # 拼到 out/mix/sample-ch01-ep01.wav
```

- `npm run timeline` 读期目录里的合成清单 `episode.json`，有分镜时也读分镜（取它的停顿覆盖，分镜不合格就报错），用和 Remotion 渲染时同一个时间轴函数算出 `timeline.json`（不提交）：帧率 `fps`、总帧数 `totalFrames`，每个旁白句（`lines`）、画面（`scenes`）、段（`segments`）的 `startFrame`（含）和 `endFrame`（不含）。旁白句的 `endFrame` 是音频结束、不含之后的停顿；总帧数到最后一句音频结束为止。
- 同一个命令还写出期目录里的打点时间表 `segments.txt`（不提交）：每段一行 `00:00 段标题`，时间是该段开始帧换算成秒后向下取整，不到 1 小时用 `mm:ss`，超过用 `h:mm:ss`，可以直接贴到视频平台的分段设置。用 `--out` 写到期目录以外时不写打点时间表，免得试听用的时间轴覆盖正式的。
- 命令最后打印总时长（`m:ss`，含停顿，向下取整到秒）和 4:00–6:00 的判断（在范围内 / 太短 / 太长，两端都算在范围内，按显示的整秒判断）；判断也写进 `timeline.json` 的 `duration` 字段（`seconds`、`text`、`verdict`：`within` / `too-short` / `too-long`，`verdictText`：判断的说明文字，`pixelbook render` 的汇总原样打印它）。样片阶段只报告，不以非零码退出。
- 只想听默认停顿、不要分镜里的覆盖时，加 `--no-storyboard`，再用 `--out` 写到别处，免得覆盖期目录里的 `timeline.json`：`npm run timeline -- ../books/sample/ch01/ep01 --no-storyboard --out ../out/mix/sample-ch01-ep01-default-pauses.timeline.json`，然后 `uv run pixelbook mix ../out/mix/sample-ch01-ep01-default-pauses.timeline.json --out ../out/mix/sample-ch01-ep01-default-pauses.wav`。
- `pixelbook mix` 只读 `timeline.json`，不知道停顿是多少秒：每句的 wav（`audio`，以 `video/public/` 为起点）从"开始帧 ÷ 帧率"秒处开始，其余是静音，补到时间轴的总时长。拼完测量音轨，和时间轴总时长相差超过一帧就报错。`timeline.json` 格式不对时逐个写明字段位置。它用的是 `video/public/episode/` 里的 wav，所以要在 `pixelbook voice` 之后、对同一期导出时间轴；重新配音后要重新导出。

## 风格表、字体与频道形象

- 风格表在 `video/src/style/style.ts`：16 色调色板 `PALETTE` 和按用途取色的 `COLOR`、像素网格 `GRID`（4px，画面上一个"像素"）、字号 `FONT_SIZE` 与行高、尺寸 `SIZE`（都是网格的整数倍）、描边 `border`、硬阴影 `hardShadow`、描边字 `outlinedText`。字幕框（`src/shell/`）和组件（`src/components/`）里的颜色和尺寸只能引用这些常量，`npm run test` 会检查源码里有没有写死的颜色值和数字（0、1 除外）。
- 字体：Fusion Pixel 12px 比例宽度简体（OFL 1.1，来源和许可在 `video/public/fonts/`）。字形画在 12×12 格上，字号只能是 12 的整数倍（现在用 24 / 48 / 96），否则会模糊；测试检查这一点。字体由 `src/style/font.ts` 在第一帧之前加载。
- 画面左上角常驻这一期的主题：旁白稿顶层的 `title`（等于大纲里这一期的 `topic`），经合成清单 `episode.json` 的 `title` 传进成片，由外壳组件 `src/shell/EpisodeTitle.tsx` 显示（橙字深色描边）。代码里没有写死的频道名。
- 频道小人不常驻画面，是一个通用组件 `Mascot`：分镜里需要"人物做什么"时才用，参数 `character`（Q 版角色，按外观起名：`dragon`、`reader`、`whale`、`gothic`，见 `style.ts` 的 `MASCOTS`）和 `position`（站在画面底部的 `left` / `center` / `right`），例如 `{ "id": "host", "component": "Mascot", "props": { "character": "reader", "position": "left" } }`。小人是从 `character/Q.png` 裁出的透明底 PNG（`video/public/character/`，裁图脚本 `character/crop_q.py`），按原尺寸、最近邻插值显示；暂时没有动效。
- 字幕只在显示时去掉分句标点 `，。、；`：句中的换成一个空格，句末（和句首）的直接去掉，紧挨在右引号、右书名号、右括号前的也直接去掉（`他说：“好的。”` 显示为 `他说：“好的”`）；`：“”‘’《》（）——？！` 保留（`video/src/shell/subtitle-text.ts`）。旁白脚本、配音、语音识别核对、合成清单和缺字检查都用原句。
- 中间帧格式是 PNG（`video/remotion.config.ts`），JPEG 会让像素边缘出现杂色。

## 检查

先运行过 `make install`，再运行：

```sh
make check
```

依次运行 pytest、ruff（lint + 格式）、`tsc`、ESLint、Vitest，任何一项失败就以非零码退出。"做完了"的标准就是这条命令通过。

能写成代码的检查都放在 `pixelbook` 命令里（`outline`、`check`、`factcheck-prompt` 等），带测试；skill 只跑这些命令，做需要判断的事（写大纲、写稿、语义核对），不让智能体写一次性脚本自查。

GitHub Actions（`.github/workflows/check.yml`）在每个 PR 和推送到 main 时，在 Linux 上跑同一条 `make check`。私有仓库设不了「合并前必须通过」，合并 PR 前自己看一眼 Checks 是否全绿。

冒烟测试单独一条命令（要真实渲染，慢一些，所以不在 `make check` 里）：

```sh
make smoke
```

它用 `tools/smoke/episode/` 里的固定小样例（4 句、带分镜和 `title`），把真实 TTS 和语音识别换成假引擎（静音 wav，不加载任何模型），在临时目录里经 `pixelbook render` 走完四步，再用 ffprobe 解码数出 MP4 视频流的帧数，和 `timeline.json` 的总帧数比，相差不超过一帧。它验证的是渲染管线和时长，不是音质；不比较音频流时长（最后一句的音频可能比视频短）。配音缓存、锁定音色、Remotion 静态目录和 MP4 都在临时目录里，不碰 `books/`、`video/public/episode/` 和 `out/`。改了配音流水线、时间轴或 Remotion 之后跑一次。

## 预览

先运行过 `pixelbook render`、`pixelbook voice` 或 `stage`，再：

```sh
cd video && npm run studio
```

在 Studio 里打开 `Episode` 合成。`StyleSheet` 合成是风格样张（调色板、字体、描边、字幕框、方块组件、小人组件的四个角色和三个站位），只在 Studio 里看，渲染命令只渲染 `Episode`；要导出成图片：`npx remotion still StyleSheet ../out/style-sheet.png`。
