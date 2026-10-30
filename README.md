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

配乐的曲子文件不进 Git，新机器上 `make install` 之后照 `video/public/music/README.md` 补齐（见「配乐」）。

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

写大纲前先看单元表：

```sh
cd tools
uv run pixelbook units ../books/pragmatic-programmer/chapters/ch02.md
```

每个单元一行：单元号和名字、首尾段落编号、段数、正文字数（编号段落文字的字符数，不算图片段；`/outline` 按它拆期），下面按原文顺序列出单元里的提示框标题和 `####` 小标题。

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
- 主题 `topic`、段标题或观点 `text` 里有书的提示编号（口径和旁白稿检查相同，见「旁白稿与检查」）；
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
- 按 250 字/分钟估算的时长不在 4:00–6:00 内（含两端）。字数口径和字幕相同：只数 `text`、去掉空白，`speech` 不算。**估算只算旁白稿，不含片头和片尾**（它们只在 Remotion 一侧接上，现在共约 25 秒，见「片头和片尾」），所以成片的真实总时长比估算多出片头片尾；这是有意的，等有几期真实数据再定要不要算进去；
- 找不到大纲、大纲格式不对（先用 `pixelbook outline` 修好），或大纲里没有这一期；这时下面几条对照大纲的检查不跑；
- `title` 不等于大纲里这一期的 `topic`；
- 段和大纲里这一期的段不是一一对应：个数、顺序、标题要都相同（大纲的 `segments` 就是旁白稿的段）；
- 本期大纲里有观点没被任何画面的 `points` 讲到，或某个画面的 `points` 引用了本期大纲里没有的观点（包括别的期的观点）；
- 一条观点被画面讲到了，但讲到它的所有画面里没有一句的 `cite` 引用了这条观点的任一出处段落（画面标了 `points`，内容却没讲这条观点）；
- 标题 `title`、段标题、字幕 `text` 或 `speech` 里有书的提示编号（`提示14`、`提示 14`、全角数字、中文数字 `提示十四` 都算；中文数字后面紧跟量词或「下」「定」时不算，如「提示一下」「提示一定要记住」）：编号对观众没有意义，讲提示框的内容，不念也不显示编号。标题和段标题等于大纲时也照样报（`check` 不跑大纲检查）。画面说明不查这一条；
- `status: final` 时，大纲给某段的 `minutes` 不等于 `sync-minutes` 会给这一段写的值（估算分钟数取到 0.25 分钟，个别段可能为了总和落在范围内多或少 0.25，见下面的 `sync-minutes`；记在段 ID 下）：跑 `pixelbook sync-minutes` 把估算写回大纲。草稿不查。
- 期目录里有 `factcheck.yaml`（见下文「语义核对」）时：它格式不对（报第一处，记在「旁白稿」下），或旁白稿里有句子没有判定、核对之后改过字幕、`speech` 或出处（记在那一句下；加上、删掉 `speech` 也算），或它判定了旁白稿里没有的句子（记在它写的句子 ID 下）。没有 `factcheck.yaml` 时不检查。

警告（不影响退出码）：

- `cite` 里的编号不在本期 `units` 覆盖的单元或段落范围里（章首导语不属于任何单元，算在范围外；章末脚注和大纲检查一样，看它的标记所在的段落）。偶尔引用别处的定义可以，审稿时看一眼；
- 照搬原文：字幕 `text` 和它 `cite` 引用的任一文字段，两边都去掉空白和标点后，有 12 个字以上连续相同。警告里写出相同的片段。标题可以照用：字幕里照用了紧挨着这一段的提示框标题（`提示N` 后面的部分，编号本身不能写进字幕，见上面的报错）或 `####` 小标题时，那一截不参与比较；
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

它把每段的估算分钟数（字数 ÷ 250，取到 0.25 分钟，最少 0.25）写回同一章大纲里这一期的 `segments[].minutes`，打印合计和每段改前改后的值；只改这几个数，注释、别的期原样保留。

各段分别取整，误差会凑到一起：全稿估算在 4:00–6:00 内，各段取整后的总和却可能落到范围外（比如三段都是 1.36 分钟，估算 4:05，取整后 1.25 × 3 = 3:45），这样的大纲过不了 `pixelbook outline`。这时 `sync-minutes` 不拒绝，而是按固定规则调整：总和偏少时，把往下舍得最多的那一段多取 0.25；偏多时，把往上入得最多的那一段少取 0.25（误差一样大时取前面的段）；重复到总和落进范围。被调整的段在输出里注明直接取整是多少。`check` 对定稿的比较用的是同一套结果，两边不会对不上。

段和大纲对不上，或全稿估算本身不在 4:00–6:00 内（`check` 也会报错，先改稿）时拒绝、不写文件。改完的大纲要照样通过 `pixelbook outline`。

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
  3. `--- 旁白句 ---`：按顺序每句两行，`s05-l05（出处：ch02-¶039）` 和 `旁白：……`，只写编号，不重复原文。手写了 `speech` 的句子多一行 `朗读：……`：配音实际念的是它，裁判要判断念出来的内容有没有依据（说明里写明两行说出的内容都要有依据）；
  4. `--- 校验码 ---`：最后一行 `校验码：fc-…`，是前面全部文字的 SHA-256 前 12 位。旁白稿或转换结果一改，校验码就变。

  没有主题、段标题、画面说明和 `points`。
- **`factcheck-record`**：先比校验码：回答顶层的 `packet` 要等于用当前旁白稿重新生成的 prompt 的校验码，缺了或不同都拒绝、不写文件（裁判没收到完整的 prompt，或出题之后改过稿或原文），要重新生成 prompt 交给新的裁判。校验码放在 prompt 末尾，能发现被截断、过期的 prompt；不能证明中间没人改过，所以 skill 必须原样转交。再要求回答和旁白稿逐句对应（同样的句子 ID、同样的顺序、不多不少），否则报出第一处对不上的位置、不写文件，要把同一份 prompt 交给新的裁判。对得上时整份覆盖 `factcheck.yaml`：`round` 是旧文件的 `round` + 1（没有旧文件时为 1），每句抄下当前的字幕和出处，有 `speech` 的句子也抄下 `speech`。最后打印汇报：各判定的句数，**改动清单**，先列不支持、再列部分支持的句子（ID、字幕、理由）。旧文件格式不对时拒绝，算不出轮次；从头核对就先删掉它。
- **核对之后写稿者只能拆句**：已经有 `factcheck.yaml`（上一轮）时，`factcheck-record` 先把当前旁白稿和上一轮记下的每句字幕、`speech`、出处比较。只拆了句时照常记录：上一轮的一句变成当前连续的几句，几句的字幕依次接起来（去掉空白后）等于原句、出处都和原句相同，念的内容也跟着拆（每句念的是它的 `speech`，没有时是字幕；几句念的依次接起来等于原句念的。原句没有 `speech` 时，拆出的句子也不写）；随之改了编号的句子不算改动。有改写（字幕、`speech` 或出处变了，包括加上、删掉 `speech`）、新增、删除时拒绝、不写文件，列出这些改动：这些都要用户决定。用户改过稿、或明确同意了这些改动之后，加 `--user-edited` 才记录；这个开关只有用户能授权（`/script`、`/factcheck` 不自己加）。
- **改动清单**：和上一轮比，按「拆分（旧 ID → 新 ID）、改写（旧字幕 → 新字幕、旧朗读 → 新朗读、旧出处 → 新出处）、新增、删除、改了编号（连续的合成一段，如 `s05-l06–s05-l22 → s05-l07–s05-l23`）」列出；没有上一轮时写「第 1 轮，没有上一轮可比」，没变时写「没有改动」。字幕、`speech`、出处都相同的句子按顺序对齐，所以两句一字不差时可能对错位置，只影响清单的写法。

```yaml
round: 1                         # 第几轮核对，正整数，从 1 起
lines:                           # 每个旁白句一条，按旁白稿顺序
  - id: s01-l01                  # 旁白句 ID
    text: 第一条原则叫 DRY。       # 核对时的字幕，由 factcheck-record 抄下
    cite: [ch02-¶040]            # 核对时的出处，同上
    speech: 第一条原则叫 D R Y。  # 核对时的 speech，同上；只在旁白句有 speech 时才有
    verdict: supported           # supported（支持）/ partial（部分支持）/ unsupported（不支持）
    reason: ¶040 给出了 DRY 的定义，旁白是它的压缩复述。   # 一句话理由
```

- 只认这五个字段（外加可选的 `speech`）和顶层的 `round`、`lines`；多出或缺少字段、`verdict` 取值不对、同一句出现两次，都是格式错误。
- `pixelbook check` 核对格式和逐句对应，并比较每句的 `text`、`cite`、`speech` 和旁白稿当前的是否相同：核对之后改过的句子报错，要重新跑 `/factcheck`。判定结果不影响退出码，有 `unsupported` 也照样通过；判定由 `/script` 汇报，你在关口 2 审。

### 完整步骤

一期从原书到成片的制作清单，下一期照着做（spec #16 用户故事 65）。`<书>` 是 `books/` 下的书目录名，`<期目录>` 是 `books/<书>/chNN/epNN`；下面的命令都从仓库根目录出发。每个人工关口都是停下等用户审，用户说通过才提交、才往下走。

| 步 | 做什么 | 写出什么（期目录以外的写明位置） | 提交 |
| --- | --- | --- | --- |
| 0 | 一本书做一次：书配置、原书、转换 | `books/<书>/book.yaml`、`source.epub`、`chapters/chNN.md` | 只提交 `book.yaml` |
| 1 | `/outline <书> <章>` | `books/<书>/chNN/outline.yaml` | 关口 1 通过后 |
| 2 | 人工关口 1：审大纲 | — | — |
| 3 | `/script <期目录>`（含 `/factcheck`） | `script.yaml`（`status: draft`）、`factcheck.yaml` | 关口 2 定稿后 |
| 4 | 人工关口 2：审稿、定稿 | `script.yaml` 改成 `final`，大纲里这一期的 `minutes` 改成估算 | 旁白稿、`factcheck.yaml`、大纲一起 |
| 5 | `pixelbook render` 出字幕版试听 | 期目录 `out/` 里的 `episode.json`、`report.json`、`timeline.json`、`segments.txt`；`out/<书>-<章>-<期>.mp4` | 都不提交 |
| 6 | `/storyboard <期目录>` | `storyboard.json`（含 `music`）、用了 CC-BY 曲子时 `out/credits.txt`；重新出的 MP4 | 关口 3 通过后提交分镜 |
| 7 | 人工关口 3：看成片 | — | — |
| 8 | 发布前准备 | 标题、简介、分段设置 | — |

**0. 一本书做一次**

- 做什么：写书配置 `books/<书>/book.yaml`（书名、作者、出版社，可选音色覆盖，见「书的音色与锁定」）；把原书放成 `books/<书>/source.epub`；转换：`cd tools && uv run pixelbook convert ../books/<书>`（见「原书转换」）。
- 本机准备（换机器时也要做一次）：`make install`；音色已选好（`voice.yaml`，见「配音模型」）；**配乐文件在本机**：`video/public/music/` 里有登记表的 8 个 `.ogg`，缺了照 `video/public/music/README.md` 补齐（曲子不进 Git，见「配乐」）。
- 完成：`books/<书>/chapters/` 里有每章的 `chNN.md`；`ls video/public/music/*.ogg` 列出 8 首。
- 出了问题：`convert` 报规则覆盖不到的元素时，先在 `tools/src/pixelbook/convert.py` 里补规则再转，不要手改转换结果。

**1. 大纲 `/outline <书> <章>`**

- 输入：`chapters/chNN.md` 和 `pixelbook units` 的单元表。输出：`books/<书>/chNN/outline.yaml`，覆盖整章，拆成几期、每期的主题、段和带出处的观点（格式见「大纲」）。
- 完成：`cd tools && uv run pixelbook outline ../books/<书>/chNN/outline.yaml` 退出码 0，照搬警告都看过；skill 停在关口 1。
- 出了问题：转换结果不存在回到第 0 步。

**2. 人工关口 1：审大纲**

- 用户看 `/outline` 的汇报（拆期理由、每期的段和分钟数、要拍板的取舍）。有意见就让 `/outline` 改；意见是规则问题时先改 skill。
- 完成：用户说通过，提交 `outline.yaml`。一章的大纲审一次，之后各期都从第 3 步开始。

**3. 旁白稿 `/script <期目录>`（含 `/factcheck`）**

- 输入：审过的大纲里这一期的段和观点、它们引用的原文段落。输出：`<期目录>/script.yaml`（`status: draft`）、`/factcheck` 写出的 `<期目录>/factcheck.yaml`，以及给不支持、部分支持的句子写好的建议改法（临时副本里，不改正式稿）。格式和机械规则见「旁白稿与检查」「语义核对」。
- 完成：`cd tools && uv run pixelbook check ../<期目录>/script.yaml` 退出码 0；`factcheck.yaml` 写出、每句都有判定；skill 停在关口 2。
- 出了问题：大纲里没有这一期，或大纲检查不过，回到第 1 步（大纲要先过关口 1）。

**4. 人工关口 2：审稿、定稿**

- 用户看 `/script` 的汇报（置顶是不支持的句子），逐句决定改法。改了正式稿之后跑 `check`，再 `/factcheck <期目录>`（用户授权的改动记录时加 `--user-edited`），回到这一步。
- 定稿：`cd tools && uv run pixelbook sync-minutes ../<期目录>/script.yaml`（把各段估算写回大纲的 `minutes`），`script.yaml` 改成 `status: final`，再跑 `pixelbook check` 和 `pixelbook outline`，都通过。
- 完成：`script.yaml`、`factcheck.yaml`、`outline.yaml` 一起提交。
- 出了问题：要改大纲的拆期或观点时回到第 1 步，改完重新过关口 1。

**5. 字幕版试听 `pixelbook render`**

- 命令：`cd tools && uv run pixelbook render ../<期目录>/script.yaml`（还没有 `storyboard.json`，所以只有字幕、主题和片头片尾，没有组件和配乐；做什么见下面的「一键出片」）。
- 输出：期目录的产物目录 `out/` 里的合成清单 `episode.json`、检查报告 `report.json`、`timeline.json`、打点时间表 `segments.txt`（第一行 `00:00 片头`），MP4 `out/<书>-<章>-<期>.mp4`；每句配音缓存在 `books/<书>/cache/tts/`。
- 完成：退出码 0；汇总里的总时长（片头、正文、片尾）在 4:00–6:00 之内；复核未通过的句子都试听过，没有读错。
- 出了问题：新术语先 `pixelbook terms` 试听、登记读音表（见「读音表与新术语」）再跑；句子读错了删掉这句的缓存重跑，或者改读音表、给句子写 `speech`；改了旁白稿（包括 `speech`）就回到第 4 步重新核对、定稿；总时长超出范围回到第 4 步改稿。

**6. 分镜 `/storyboard <期目录>`**

- 先确认配乐文件在本机（第 0 步），缺了第 5 步的渲染会报错并指向 `video/public/music/README.md`。
- 输入：定稿的 `script.yaml` 里的画面说明和旁白句，README「分镜」「组件目录」。skill 先配音写出 `episode.json`（命中缓存），跑选曲命令 `cd video && npm run music:pick -- ../<期目录>`（把 `music` 写进 `storyboard.json`，之后不再改），再写分镜，跑 `npm run timeline -- ../<期目录>` 直到通过，最后 `pixelbook render` 出片、看样帧。
- 输出：`<期目录>/storyboard.json`（每个画面至少一个组件）；重新写出的 `<期目录>/out/` 里的 `timeline.json`、`segments.txt`，`out/<书>-<章>-<期>.mp4`；用了 CC-BY 曲子时 `<期目录>/out/credits.txt`（CC0 曲子没有）；交给用户的「表现不了」清单。
- 完成：`npm run timeline` 和 `render` 退出码 0；每个画面的样帧看过，没有遮挡和穿过；skill 停在关口 3。
- 出了问题：`script.yaml` 不是 `final` 或检查不过，回到第 4 步；分镜检查不过，skill 自己改分镜；画面说明要的东西现有组件表现不了，列进清单交给用户（加组件是另开的票）。

**7. 人工关口 3：看成片**

- 用户看 MP4、「表现不了」清单、配乐（曲子、许可、避开了哪一期的哪首）和每个画面用的组件。意见只改分镜（或用户同意的组件改动），改完 `/storyboard` 从它的第 5 步重跑；音量在 `video/src/style/volume.ts` 的 `VOLUME_DB` 调。
- 完成：用户说通过，提交 `storyboard.json`。
- 出了问题：要改旁白（句子、画面说明）时回到第 4 步，定稿后再从第 6 步跑。

**8. 发布前准备**

- 成片：`out/<书>-<章>-<期>.mp4`（第 7 步通过的那一版）。
- 简介：写明原书的书名、作者、出版社，照 `books/<书>/book.yaml` 抄。`<期目录>/out/` 里有 `credits.txt`（用了 CC-BY 配乐）时，把它那一行原样贴进简介；没有就不用贴。
- 分段：`<期目录>/out/segments.txt` 原样贴到视频平台的分段设置（第一行是 `00:00 片头`，片尾不列）。
- 完成：MP4、简介、分段三样都在手里。

#### 一键出片 `pixelbook render`

```sh
cd tools
uv run pixelbook render ../<期目录>/script.yaml   # 默认写到 out/<书>-<章>-<期>.mp4
```

依次运行四步，任何一步失败就停下，打印"第几步「哪一步」失败：原因"并以退出码 1 结束：

| 步 | 做什么 | 常见的失败 |
| --- | --- | --- |
| 1 配音 | 同 `pixelbook voice`：定稿状态守卫、新术语检查、音色锁定守卫、缺字检查、逐句配音与复核，复制到 `video/public/episode/` | 旁白稿是 `draft`、新术语、音色和锁定不一致、缺字、配置文件写错 |
| 2 时间轴 | 同 `npm run timeline`：校验分镜（含组件触发帧是否落在画面里），写出 `timeline.json`、`segments.txt`，用了 CC-BY 配乐时写出 `credits.txt` | 分镜不合格 |
| 3 渲染 | 先确认分镜选的配乐文件在 `video/public/music/` 里，再 `remotion render Episode`（只渲染成片，不渲染风格样张） | 配乐文件不在本机（报错指向 `video/public/music/README.md`）、Remotion 报错（附上输出的最后几行） |
| 4 核对时长 | 用 ffprobe 数 MP4 **视频流**的帧数，和 `timeline.json` 的总帧数比，相差超过一帧就算失败 | — |

全部通过后打印汇总报告：MP4 路径、帧数、总时长（含片头片尾，另外分开写片头、正文和片尾）和 4:00–6:00 的判断、打点时间表位置、复核未通过的句子（需要试听）、靠拼音通过的句子（只列出备查）。**复核未通过和总时长超出范围不算失败**，只列在汇总里。

`--out <路径>` 改输出位置；`--revoice` 同 `voice --revoice`（音色和书的锁定音色不一致、确认整本书换音色时用）；`--draft` 同 `voice --draft`（旁白稿还是 `status: draft` 时放行）。

改了分镜只要再跑一遍 `render`，配音全部命中缓存，不会重新生成。

分步运行（排查某一步时用）：

```sh
cd tools
uv run pixelbook voice ../<期目录>/script.yaml   # 逐句配音，生成合成清单
cd ../video
npm run timeline -- ../<期目录>                   # 时间轴、打点时间表、总时长
npm run render -- ../out/<书>-<章>-<期>.mp4       # 渲染 MP4
```

`voice` 先看定稿状态（`status: draft` 时拒绝，加 `--draft` 放行），再按读音表检查新术语（见下），没有新术语才用这本书的音色（见下文“书的音色与锁定”）逐句配音，写出期目录的产物目录 `out/` 里的合成清单 `episode.json`（每个画面带上原样抄自旁白稿的画面说明 `description`，供组件上的字做检查），再清空 `video/public/episode/`，把每句 wav、合成清单和分镜（有的话）复制进去。Remotion 只读 `video/public/episode/` 里的这两份。合成清单缺画面说明（#32 之前配音写出的）时 Remotion 和 `npm run timeline` 拒绝读取，重新运行 `pixelbook voice` 即可，配音全部命中缓存，不会重新生成。

每句配音缓存在 `books/<书>/cache/tts/<指纹>.wav`（不提交），指纹由朗读文本和音色指纹算出；音色指纹包括模型、参考音频的**文件内容**、参考文本、生成参数和引擎自身的设置（如参考音频补的静音），不包括随机种子。所以再次运行时只有改过的句子会重新生成，改了音色设置或换了参考音频的内容就全部重新生成。每个 wav 旁边的 `<指纹>.json` 记录生成信息。缓存可以随时删掉，删了就整期重新生成。

### 片头和片尾

整期结构是**片头 + 正片 + 片尾**（spec #16「修订二」「修订三」，#50、#51 实现，ADR-0012）。片头、片尾都是做好的 Remotion 动画加自带音轨，所有期、所有书都一样，不随书名或期数变化；它们只在 Remotion 一侧接上，Python 和旁白稿都不知道它们的内容。现在用的是用户做的这两个：

| | ID | 帧数（30fps） | 内容 |
| --- | --- | --- | --- |
| 片头 | `load-pixel-book` | 422（约 14.07 秒） | 终端打出 `LOAD "PIXEL BOOK"` → 选角色 → 四个角色亮相 → 闪白 → PIXEL BOOK 标题和 PRESS START → CRT 关机 |
| 片尾 | `bye-bye` | 324（10.8 秒） | 四个小人落地 → 被元素墙追着跑 → 墙铺满 → 翻出 BYE-BYE → CRT 关机；自带三句配音「本期先讲到这里，」「欢迎大家阅读原著了解更原汁原味的内容，」「我们下一期见」和同风格的字幕框 |

- **文件**：每个片头片尾一个目录，`video/src/intro/<ID>/`、`video/src/outro/<ID>/`：动画（`Intro.tsx` / `Outro.tsx`、`sprites.tsx`），时间点 `timing.json`（帧数 `total` 就是它的长度），音轨脚本 `make_audio.py`；片尾还有用户录好的三句配音 `voice/outro-l0{1,2,3}.wav`（24 kHz 单声道，提交）。生成的音轨 `video/public/intro/<ID>.wav`、`video/public/outro/<ID>.wav` 提交（44.1 kHz 双声道 16 位，长度正好是登记的帧数）。字体和四张角色图用 `video/public/` 里原有的（和用户原工程逐字节相同）；两个 `sprites.tsx` 内容相同，各放一份，每个目录自成一体，删掉或换掉一个不影响另一个。用户原工程的 `remotion.config.ts`、`Root.tsx`、`index.ts` 不搬。
- **登记表**：片头 `video/src/intro/intros.ts`、片尾 `video/src/outro/outros.ts`，ID → 标题 `title`、帧数 `frames`（取自 `timing.json` 的 `total`）、音轨 `audio`；和配乐库一样，导入时 `defineBookendLibrary`（`video/src/bookend/library.ts`）校验：帧数是正整数，音轨固定是 `<intro|outro>/<ID>.wav`。登记表是纯 .ts，不引用 React（时间轴导出在 Node 里只要帧数）；动画组件按同样的 ID 登记在 `intro/intro-components.ts`、`outro/outro-components.ts`，类型是 `Record<ID, 组件>`，少登记一个类型检查就不过。Episode 和 Root 不直接引用这两对文件，只从 `video/src/bookend/bookends.tsx` 取（成片里放选中的那个用 `SelectedBookend`，Studio 里每个一个预览合成用 `BOOKEND_PREVIEWS`）。`npm run test` 还检查每个登记的音轨都在、格式和长度对，`public/intro/`、`public/outro/` 里没有没登记的文件。
- **项目配置**：`video/src/project-config.ts` 的 `PROJECT` 写每期用哪个片头、哪个片尾（登记表的 ID），写 `null` 就是「不用」。`planEpisode` 默认用它；组件样张页两个都不用（`planEpisode(…, { intro: null, outro: null })`）。没登记的 ID 报错，并列出登记过的。
- **用户的作品，不按组件规则改**：动画是用户定稿的，搬进来时只为 `make check` 的类型检查加了非空断言 `!`（`noUncheckedIndexedAccess`），配色、尺寸、时间点都没动。它们不在 `video/src/components/` 里，不受「组件只引用风格表」「组件不写死显示文字」两项检查约束（这两项只扫组件目录）；也不是分镜组件：不占网格、没有状态，不进组件目录。
- **进时间轴**：`planEpisode` 把选中的片头的帧数记为时间轴的 `introFrames`，正文第一句从这一帧开始，组件的触发帧、音效帧整体后移；正文到最后一句音频结束为止（不加停顿），片尾紧接着开始，占最后 `outroFrames` 帧；最后一个画面和段到片尾开始为止。`totalFrames` = 片头 + 正文 + 片尾，帧数核对和总时长判断都按选中的那一个的帧数算，不写死。
- **画面和声音**：片头、片尾期间不显示字幕和主题（`showsResidents`），盖在正片画面上面。它们自带的音轨原样放（`VOLUME.intro`、`VOLUME.outro`，都是 0 dB）。配乐从片头结束放到正文结束，在**正文**最后 2 秒淡出，不覆盖片头和片尾（见「配乐」）。
- **预览和对比**：Studio 里每个登记的片头片尾有一个合成 `Intro-<ID>`、`Outro-<ID>`，单独放它（带音轨）；`npx remotion render Outro-bye-bye ../out/outro.mp4` 渲染出来可以和用户的参考成片比（#50、#51 的评论里有 PSNR/SSIM 结果）。
- **改音轨**：改了 `timing.json`、`make_audio.py` 或片尾的配音之后重新生成音轨（需要 numpy，`make install` 已装进 `tools/.venv`；片尾的脚本还要 ffmpeg）：

  ```bash
  tools/.venv/bin/python video/src/intro/load-pixel-book/make_audio.py \
    video/src/intro/load-pixel-book/timing.json video/public/intro/load-pixel-book.wav
  tools/.venv/bin/python video/src/outro/bye-bye/make_audio.py \
    video/src/outro/bye-bye/timing.json video/src/outro/bye-bye/voice video/public/outro/bye-bye.wav
  ```

  `make check` 里的 `tools/tests/test_bookend_audio.py` 重新生成一遍和提交的文件比（格式、长度相同，每个采样相差不超过 1；片尾不超过 4，因为它的配音经 ffmpeg 重采样，不同版本的 ffmpeg 在最后几位上不同），忘了重新生成会失败。
- **换一个片头或片尾**（以片尾为例，片头把 `outro` 换成 `intro`）：
  1. 新建 `video/src/outro/<新ID>/`，放动画组件（导出一个不带参数的 React 组件，按 30fps、1920×1080 画，从第 0 帧开始，自己用 `useCurrentFrame`）、`timing.json`（至少有帧数 `total`）和生成音轨的脚本；字体、图片放进 `video/public/` 用 `staticFile` 读，用到风格表里的像素字体时不用再加载（`Root.tsx` 已加载）。
  2. 生成音轨到 `video/public/outro/<新ID>.wav`（44.1 kHz 双声道 16 位，长度正好是 `total` 帧），在 `tools/tests/test_bookend_audio.py` 的 `BOOKENDS` 里加一行（脚本参数各不相同）。
  3. 在 `outro/outros.ts` 登记 `<新ID>: { title, frames: timing.total, audio: "outro/<新ID>.wav" }`，在 `outro/outro-components.ts` 登记它的组件。
  4. 把 `project-config.ts` 的 `outro` 改成 `<新ID>`（不要片尾就写 `null`）。旧的不用了可以一起删掉：目录、音轨、两处登记和测试里的那一行。
  5. `make check`，再在 Studio 里看 `Outro-<新ID>` 和整期的 `Episode`，`make smoke` 跑一次。

### 语音识别复核

每句配音生成后，都用本地语音识别模型转回文字，和**朗读文本**（读音替换之后的文本，或手写的 `speech`）对比，不和字幕文本对比。对比前两边都做同样的规范化：统一全角半角、繁体转简体、中文数字转阿拉伯数字（`第二章` → `第2章`）、英文转小写，再去掉标点和空白。

复核分两步，只识别一次：

1. 先比字：字符差异率 = 编辑距离 ÷ 朗读文本的字数，不超过阈值就通过。
2. 比字不通过，再把两边（规范化之后）转成不带声调的拼音比：每个汉字一个音节，英文字母和数字不转、每个字符算一个单位，拼音差异率不超过同一个阈值也算通过。识别模型把“它”听成“他”这类同音字就靠这一步通过；“写”读成“选”这类读成别的音的，两步都不通过。
3. 两步都不通过，这一版才算复核不通过。

设置在仓库根目录的 `verification.yaml`：识别模型 `asr`（`qwen3-asr` 或 `whisper`）、阈值 `max_diff_rate`（字符和拼音两步共用，差异率超过它就算这一步不通过）、重试次数 `max_retries`。不通过的句子重新生成，直到通过或用完重试次数；用完仍不通过，就用差异率最低的一版，照常进合成清单，并列进产物目录 `out/` 里的检查报告 `report.json` 的 `asr_failures`（字幕文本、朗读文本、识别结果、字符差异率、拼音差异率、缓存文件），`voice` 也会打印出来。比字不通过、靠拼音通过的句子单独列在 `asr_pinyin_passes`，方便查同音字；它们算通过，不用处理。复核结果写在缓存旁边的 `<指纹>.json` 里（每一版的字符差异率 `diff_rate`、拼音差异率 `pinyin_diff_rate`——比字就通过时不算拼音，记为 `null`——和靠哪一步通过 `passed_by`：`chars`、`pinyin` 或 `null`）：缓存命中的句子不再生成、不再识别，没通过的句子每次运行都继续列出。听过之后确实读错了，删掉报告里那个缓存 wav 再运行 `voice` 就会重新生成；是识别错了就不用管。

改 `verification.yaml` 不影响声音，不会被音色锁定拦下，也不会让已缓存的句子重新复核。改成两步复核之前缓存的句子没有拼音结果，照常命中，按当时的结果列出；想用新规则重新复核，删掉它的缓存。

### 缺字检查

`voice` 还检查字幕文本里的每个字在像素字体（`video/public/fonts/` 里的 Fusion Pixel）里有没有字形：缺字时浏览器会换成系统字体，画面上混进一个不是像素风的字。左上角的主题 `title` 和每个画面的画面说明也一样检查（组件上的字可以取自画面说明）。缺的字列进检查报告的 `missing_glyphs`（旁白句 `id` 和字 `char`；画面说明里缺的字，`id` 是画面 ID；主题里缺的字，`id` 记作 `title`），`voice` 打印出来并以非零码退出。这项检查在配音之前做：有缺字就不配音，合成清单、`video/public/episode/` 和锁定音色都不动，检查报告里只有 `missing_glyphs` 一项。改写那句字幕或画面说明（或者换字体）后再配音。空白不检查。

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

每期可以有一份分镜 `books/<书>/<章>/<期>/storyboard.json`（提交到 git），写每个画面用哪些组件、在哪句旁白出现，不写绝对时间。旁白稿定稿后用 `/storyboard <期目录>` 写：它先跑选曲命令（见「配乐 › 选曲」），按画面说明和下面的「组件目录」写分镜，跑 `npm run timeline` 直到通过，再 `pixelbook render`，停在人工关口 3。`voice` 和 `stage` 把它复制到 `video/public/episode/`；没有分镜时照常渲染，只有字幕。

```json
{
  "scenes": [
    {
      "scene": "s01-c02",
      "components": [
        { "id": "dry", "component": "PixelBlock", "props": { "label": "DRY", "size": "large", "color": "orange" }, "at": [4, 1] }
      ],
      "triggers": [
        { "target": "dry", "line": "s01-l03", "offset": 1.2, "action": "enter", "animation": "slide" },
        { "target": "dry", "line": "s01-l04", "offset": -0.3, "action": "state", "state": "highlight" },
        { "target": "dry", "line": "s01-l05", "offset": 0.5, "action": "exit", "sound": null }
      ]
    }
  ],
  "music": "forgotten-path",
  "pauses": [{ "after": "s01-l04", "seconds": 1.2 }]
}
```

- `scene`：合成清单里的画面 ID。`components`：本画面用的组件，`id` 是本画面里的名字，`component` 是组件名，`props` 按该组件的参数格式校验。
- **每个画面至少一个组件**（spec #16 用户故事 56，#46）：合成清单里的每个画面都要写进 `scenes`，`components` 不能为空，否则报「画面 … 没有组件」。片尾不是画面（#51），没有例外。
- `at`：组件左上角所在的格 `[列, 行]`，从 0 开始（见下面的「网格」）。连线类组件（箭头）不写 `at`，改写 `from`、`to`；其余组件必须写 `at`。组件占几格由组件按参数自己算，分镜只写位置。
- `parent`（可选）：父组件的 id，表示有意嵌套（大方块里占一小角）；`from`、`to`：连线类组件的起点和终点。见下面的「嵌套」和「组件目录 › 箭头」。
- 新组件要登记三处：**声明**放在组件自己的 `video/src/components/<组件>-declaration.ts`（连同参数格式和尺寸计算），再汇总进 `declarations.ts`。按格子摆放的组件用 `declareComponent`，连线类组件用 `declareConnector`（格式见 `declaration.ts`）。两种都有：参数格式 `props`（zod）、状态清单 `states`（第一个是初始状态）、入场和退场的默认动画 `enter`、`exit`（`exit` 不写是 `fade`）、可选的自己的特殊效果 `effects`（见下面的 `animation`）、默认音效 `sounds`（见下面的「音效」；退场音效 `exit` 不写是 `leave`）、可选的按参数能用的状态 `availableStates`（见下面的「带序号的状态」）。按格子摆放的组件还要写占几格 `cells`（按参数算，`[列数, 行数]`），可选的标签位置 `labelArea`（见下面的「嵌套」）；连线类组件不占格，没有这两项；会显示在画面上的参数用 `displayText` 标出，见下面的「显示文字」），**实现**在 `video/src/components/registry.ts`，**样张**在 `video/src/components/samples.ts`；少登记一处，类型检查会报错。还要在下面的「组件目录」里给它写一个小节，列出每个状态名（`npm run test` 检查）。分镜检查只依赖声明，不含 JSX，时间轴导出命令在 Node 里也用它校验分镜。
- **渲染接口**（`video/src/components/stage.ts`）：组件实现是 `React.FC<RenderProps<参数>>`，拿到两样东西：

  ```ts
  type RenderProps<Props> = { props: Props; stage: Stage; ends: Ends | null };
  type Ends = { from: Rect; to: Rect }; // 连线类组件两端组件的矩形（屏幕像素），其余组件为 null
  type Stage = {
    state: string;       // 当前状态：入场时是声明的第一个状态，之后按 state 触发变化
    previousState: string | null; // 切到当前状态之前的状态；还没切换过时为 null
    stateFrames: number; // 进入当前状态以来的帧数（进入的那一帧是 0；初始状态从入场帧算起）
    enter: number;       // 入场动画的进度 0 → 1（线性）；播完或动画是 none 时为 1
    exit: number;        // 退场动画的进度 0 → 1（线性）；退场之前为 0
    enterAnimation: string;        // 入场用的动画名（通用动画或组件自己的特殊效果）
    exitAnimation: string | null;  // 退场用的动画名；没有退场时为 null
  };
  ```

  Episode 按排期把组件放进它在网格上占的矩形（`cellRect`，连线类组件铺满画面），外面套上通用的入场和退场动画（`fade`、`slide`、`none`，带缓动；组件自己的特殊效果不套，由组件按 `enter`、`exit` 的进度自己画），组件自己只画「这个状态、这一帧」的样子，填满给它的矩形。排期在 `Cue` 里带上 `initialState`，入场和退场各带上动画播几帧 `frames`（特殊效果按声明的时长），`stageAt(cue, 帧)` 算出舞台信息；连线类组件的 `Cue.ends` 是两端组件占的格，Episode 换算成屏幕矩形交给组件。
- **样张**：每个组件在 Studio 里有一页 `Sample-<组件名>`，用 `samples.ts` 里的假分镜（经同一个 `planEpisode` 排期）把它的每个状态、每种入场和退场动画、每个默认音效都演一遍，字幕位置写着这一刻在演什么，同时放出音效。`npm run test` 检查每个登记的组件都有样张、样张通过分镜检查、演到了每个状态和每种入场退场动画、放到了入场、退场和切到每个状态的默认音效。导出某一帧：`npx remotion still Sample-PixelBlock ../out/samples/pixelblock.png --frame=300`。7 个组件首尾相接的样片是合成 `ComponentSamples`（见「组件目录」）。
- `triggers`：每条触发让 `target` 组件在 `line` 这句开始后偏移 `offset` 秒做一个动作（ADR-0011），`action` 三选一：
  - `enter` 入场、`exit` 退场：可选 `animation`，不写就用组件声明的默认动画。
  - `state` 切换状态：必须写 `state: <状态名>`，状态名必须是组件声明过的；组件声明了 `availableStates` 时还必须是这组参数下能用的（比如 3 条路的岔路不能用 `block-4`），否则报错并列出能用的状态。组件入场时是初始状态。
- 三种动作都可以写 `sound`：写音效 ID（音效登记表里的）就替换这个动作的默认音效，写 `null` 就不放，不写就用组件声明的默认音效（见下面的「音效」）。
- `animation` 的取值（入场和退场通用）：`fade` 淡入 / 淡出，`slide` 从上方落下 / 向上升起，各播 0.4 秒（风格表 `MOTION.animationSeconds`）；`none` 瞬间出现 / 消失，不播动画（也不放音效），用来把同一个东西接到下一个画面。组件还可以有**自己的特殊效果**：在声明的 `effects` 里登记效果名和秒数（秒数取自风格表 `MOTION`），可以作为它的默认动画，分镜的 `animation` 也可以写这个名字，只有这个组件能用（写了组件没有的动画报错，并列出它能用的动画）；退场动画是否在画面结束前播完、重叠检查的区间，都按登记的时长算。现在只有提示牌的 `light`（亮起，0.8 秒）。
- 每个组件恰好一次 `enter`、最多一次 `exit`、任意次 `state`。帧顺序必须是 **入场 ≤ 切换状态 < 退场**；同一帧切两次状态、切到组件当前已经是的状态都报错。没有 `exit` 的组件显示到画面结束（下一个画面的第一句开始）；有 `exit` 的，显示到退场动画播完，退场动画必须在画面结束前播完，否则报错。
- `line` 必须是本画面的旁白句。触发帧 = 这句的开始帧 + `offset` 秒 × 帧率，四舍五入到整帧；`offset` 可以为负，但触发帧必须落在本画面之内，否则渲染前报错。画面从它的第一句开始，所以**负偏移不能挂在画面的第一句上**：上例里 `s01-l04`（`s01-c02` 的第二句）的 `-0.3` 表示在上一句 `s01-l03` 快结束时高亮；要是写成 `{ "line": "s01-l03", "offset": -0.3 }`（`s01-l03` 是这个画面的第一句），触发帧就早于画面开始，报「触发帧 … 早于画面 s01-c02 的开始帧 …」。想在画面一开始就出现，写第一句、`offset: 0`。
- `music`（必填）：配乐登记表里的曲子 ID，从片头结束后播放到正文结束（比正文短时循环，接缝处交叉淡化），正文最后 2 秒淡出，不覆盖片尾（见下面的「配乐」）。没登记的 ID 报错，并列出登记过的。
- `pauses`：覆盖 `after` 这句之后的停顿（秒，≥ 0），优先于默认规则（句间 0.3 秒、换画面 0.8 秒）。

分镜在 Remotion 读取时和 `npm run timeline` 里校验（同一个 `planEpisode`），出错时报出第几个画面、第几个组件或触发、哪个字段。

#### 网格

组件摆在字幕框上方的 12 列 × 6 行粗网格里（`video/src/style/grid.ts` 的 `layoutGrid`，就放在风格表旁边）：

- **区域**：左右各扣掉安全边距 `SIZE.margin`；上沿是左上角主题的下沿（`SIZE.margin` + 字幕字号的行高），下沿是字幕框外描边的上沿（画面高 − `SIZE.margin` − 字幕框高 − 外描边 `SIZE.stroke`，字幕框高 = 2 × `SIZE.stroke` + 2 × `SIZE.subtitlePaddingY` + 字幕字号的行高；字幕最多 20 字，总是一行）。
- **每格**：区域宽 ÷ 12、区域高 ÷ 6，各自向下对齐到像素网格 `GRID`（4px）；余下的像素平均分到两侧（每侧也向下对齐到 4px）。
- 1920×1080 下：区域 x 64–1856、y 128–880，每格 **148 × 124** 像素，第 0 列从 x = 72 开始，第 0 行从 y = 132 开始。
- **越界**：`at` 加上组件占的格数超出 12 列或 6 行时报错（报出第几个画面、第几个组件、超出哪一边）。
- **重叠**：同一时间都在画面上的两个组件，格子有重叠就报错，报出两个组件、第一个重叠的格和同时在画面上的帧。「同时在画面上」按排期的帧区间算：从入场帧到退场动画播完（没有退场的到画面结束），所以先退场、后入场的两个组件，后一个要等前一个的退场动画播完（`fade`、`slide` 0.4 秒；`none` 不用等）才能占同一格。连线类组件不参加重叠检查；子组件和它的父组件（及更上层）不算重叠，和别的组件照常检查。

`video/src/episode/ep01-placement.test.ts` 用 ch02 ep01 的合成清单（`fixtures/ep01-episode.json`，去掉了音频路径）和一份占位分镜，把 17 个画面各摆了一遍，作为摆放的参考，7 个组件都用组件注册表里真实的声明：s01-c01 五个小人挤成一群（`crowd`），上面一排四个知识块；s02-c02 三个小人一排（`row`），旁白说「刻意问自己」时一起冒问号，下面一排三个知识块；s01-c03 三个方块各有一个箭头指向 ETC；s05-c04 的「复制粘贴源码」先单独出现，旁白说「只是很小的一部分」时用 `none` 瞬间换成大方块「知识和意图」左上角的子组件（子组件不能早于父组件入场）；s05-c05 代码在左，箭头指向右上的文档和右下的数据库 Schema；s02-c01 岔路标出第 2 条路，s03-c02 岔路放上路障又撤掉，s04-c04 时间线「起点、开发过程、发布」点亮到第 3 个。

#### 字宽估算

组件上的字（知识块的标签、提示牌的标题、电脑屏幕上的字、岔路和时间线的标签）不换行、不加字距，放不下时报错，不会悄悄溢出或换行。每个组件能放多宽见下面「组件目录」里它的小节。宽度按像素字体估算（`video/src/style/text-width.ts` 的 `textWidth`）：

- 汉字、全角符号和弯引号（ASCII 以外的字）按 1 个字号宽；
- 拉丁字母、数字、空格和半角符号（U+0020–U+007E）按字体度量：`video/src/style/ascii-advances.json` 是从字体文件的 `hmtx` 表导出的每个字符的步进宽度（字体像素，乘以 字号 ÷ 12 就是屏幕像素），例如 `W` 10、`M` 8、`a` 6、`i` 4。`tools/tests/test_font_metrics.py` 核对这张表和字体文件一致；换字体时要重新导出。
- 不算字距。例：`数据库 Schema` 在字号 48 下是 3 × 48 + 6 × 4 + 39 × 4 = 324 像素。

#### 嵌套

需要「大方块里占一小角」时（spec #16 用户故事 22），子组件写 `parent: <父组件 id>`，`at` 照常写网格上的绝对位置：

- 父组件必须是本画面里按格子摆放的组件，**写在子组件前面**（后写的画在上面，子组件才不会被父组件盖住），不能是自己。
- 子组件的格子必须完全落在父组件的格子里，区间也必须完全落在父组件的区间里（同一帧入场合法）；这时不算重叠。任一条不满足都报错。
- 子组件不能压住父组件的标签：组件声明里的 `labelArea(props)` 给出标签占的格（相对组件自己的左上角），子组件的格子和它有公共格就报错。不写 `labelArea` 的组件没有要让开的字。每个组件哪里能嵌子组件，见「组件目录」里它的小节。
- 例：`知识和意图`（`large`，`at: [4, 1]`）的左上角嵌一个 `复制粘贴源码`（`small`，`at: [4, 1]`，`parent: "intent"`）。

#### 带序号的状态

「第 N 条路有路障」「点亮到第 N 个节点」用**每种情况单独声明一个状态**（`block-1` … `block-4`、`lit-1` … `lit-6`），不用带参数的状态名，分镜的 `state` 写法和别的组件一样。状态清单按参数的上限声明；声明里的 `availableStates(参数)` 给出这组参数下能用的状态，分镜检查据此拦下超出条数、节点数的序号（「按它的参数不能用状态 block-3，能用的状态：…」）；写了根本没声明的名字（如 `block-5`）照常报「没有状态」。组件实现从舞台信息的 `previousState` 知道是从哪个状态切过来的（撤掉哪条路上的路障、从哪个节点接着亮）。

#### 显示文字

组件上显示的每一段字，都必须出自本画面的画面说明或旁白句，这样画面不会引入原文以外的说法（spec #16 修订 D4）。分镜检查（同一个 `planEpisode`）逐个核对：

- **哪些参数是显示文字**：组件声明的参数格式里用 `displayText(...)` 标出（`video/src/components/declaration.ts`，登记在 zod 4 的 registry `DISPLAY_TEXT` 里，不另写清单）。只能标字符串或字符串数组（数组逐项检查），只认参数对象的顶层字段（外面可以套 `.optional()`）；`npm run test` 检查组件注册表里每个显示文字参数都是字符串或字符串数组。现在有知识块的 `label`、提示牌的 `label`、`number`、`title` 和电脑的 `screen`。
- **比对口径**：两边先做 NFKC 规范化，再去掉 `，。、；` 和空白，然后看显示文字是不是**本画面的画面说明**或**本画面某个旁白句原句**（合成清单的 `text`，不是朗读文本）的子串。NFKC 会把全角的 `，`、`；` 变成半角，所以半角的 `,`、`;` 也一并去掉；`？`、`！`、引号、破折号照常比。每项单独和每一处出处比，不能跨两句拼接。
  - 例（ep01）：`s01-c03` 里「解耦」「单一职责」通过；`s05-c05` 里「数据库 Schema」和「数据库Schema」都通过；`s02-c02` 里「更容易改，还是更难改？」和「更容易改 还是更难改？」都通过；`s01-c02` 里「提示14」（画面说明「提示14 的标题牌亮起」）通过；`s05-c02` 里「DRY——不要重复自己」报错（旁白句是「DRY，就是不要重复自己。」）。
- 显示文字不能是空串，去掉标点和空白后是空串也报错。
- 报错写明第几个画面、第几个组件（id 和组件名）、哪个参数（数组还写第几项）、找不到的那段字，例如 `第 1 个画面 第 1 个组件 props label: 组件 k（PixelBlock）的显示文字「DRY——不要重复自己」不在画面 s05-c02 的画面说明和旁白句里`。
- **组件不渲染参数以外的固定文字**。比如电脑屏幕上的「ERROR」，也要作为显示文字参数传进去，并且写进画面说明或旁白句。`npm run test` 扫描组件目录里的 `.tsx`（`findFixedText`，`video/src/style/hardcoded.ts`），找出 JSX 里直接写的字（`<b>ERROR</b>`、`{"ERROR"}`）；藏在常量里再引用的字认不出来，靠代码审查。
- **强度有限**：这条检查只能挡住原文以外的词，挡不住拼凑。几项各自出自原文的字摆在一起，照样可能拼出原文没有的意思，这要靠审分镜时人看。

#### 音效

组件入场、退场、切换状态时自动响起一个短促的 8-bit 音效，分镜可以在单个触发上关掉或替换（spec #16 用户故事 27–31）。

- **登记表**：`video/src/sound/sounds.ts` 的 `SOUNDS`（音效 ID → 文件，以 `video/public/` 为起点）。它是纯 TypeScript 模块、不读文件系统，分镜检查（Node 里的时间轴导出命令）和 Remotion 播放共用这一份导入。现在有 7 个：`drop` 落下、`pop` 弹出、`blip` 轻点（切换状态）、`buzz` 嗡（出错、被改动）、`ding` 叮（点亮、提示牌亮起）、`leave` 退场、`crash` 崩溃。
- **文件**：音效放在 `video/public/sfx/`，每个音效两份文件：`<ID>.wav`（16 位单声道 PCM，44.1 kHz）和生成它的 jsfxr 参数 `<ID>.sfxr.json`，都提交（`.gitignore` 全局忽略 `*.wav`，对这个目录开了例外）。不能放在 `video/public/episode/` 下：配音每次都会删掉那个目录。
- **生成**：`cd video && npm run sfx` 用 jsfxr（devDependency，固定 1.4.1）的 `sfxr.toWave` 在 Node 里把登记表里每个音效的参数生成成 wav，并打印时长和削波的采样数。只在本机运行，CI 不重新生成。参数是**展开后的完整参数**（波形、包络、频率、音量 `sound_vol`、采样率和采样位数 `sample_size: 16` 都写明），不是预设名：jsfxr 的预设每次随机。新加音效：在登记表里加一项，写好同名的 `.sfxr.json`，再运行 `npm run sfx`。
- **重新生成不保证逐字节相同**：噪声波形（`wave_type: 3`，现在是 `crash`）生成时用了随机数，重新生成只能做到听感一致；其余波形是确定的。
- **组件声明的默认音效**：`sounds: { enter, exit, states }`，每个动作、每个状态各写一个音效 ID，或写 `null` 表示不用音效；`states` 必须为每个状态都写一项（少写类型检查会报错）。组件入场时处在初始状态，**只响入场音效**，不响初始状态的音效；之后切回初始状态时才响它。每个组件的默认音效见「组件目录」里它的小节。
- **规则**：触发上的 `sound` 替换的是这个触发的动作的音效。引用登记表里没有的音效 ID 时报错（报出第几个画面、第几个触发）。动画是 `none` 的入场和退场不放音效，在这样的触发上写音效 ID 也报错（写 `null` 可以）。用到的音效的 wav 不在 `video/public/` 里时，时间轴导出命令（`npm run timeline`）也报错，报出音效 ID 和文件（spec #16 用户故事 30）。同一帧的同一个音效只放一次（#37 定的，`video/src/episode/storyboard.ts` 的 `soundCues` 去重；比如三个知识块同时落下，只响一声 `drop`，不会叠得更响，Studio 预览和成片一致）；同一帧的不同音效都放。
- **播放**：`planEpisode` 输出音效列表 `sounds`（帧、音效 ID，按帧排序），Episode 和样张页在对应的帧播放（`video/src/sound/SoundCues.tsx`）。时间轴导出命令也把它写进 `timeline.json` 的 `sounds`。
- **音量**：旁白、音效、配乐的音量常量在 `video/src/style/volume.ts` 的 `VOLUME_DB`，用 dB 写（相对旁白），换算成 Remotion 要的 0–1 线性值 `VOLUME`（以旁白为 1）。现在音效 -12 dB、配乐 -20 dB，到人工关口 3 再调。音效文件本身的峰值在 -6 到 -8 dBFS（`npm run test` 检查每个音效文件是 16 位单声道、有声音、峰值低于 -1 dBFS）。
- `npm run test` 还检查：登记的每个音效的 wav 和参数文件都在、参数是 16 位采样，`sfx/` 里没有没登记的文件，每个组件声明的音效都已登记。`make smoke` 用静音的假旁白真实渲染一次，检查每个音效都在它的帧响起（有配乐垫底，办法见「检查」里的冒烟测试），并检查三个不同的音效同时响起时不削波。

#### 配乐

配乐库有 8 首完整的歌（8-bit / lofi / 钢琴风格），每期从里面选一首垫在旁白下面，曲子比正文短时循环，接缝处交叉淡化（spec #16 用户故事 44–53、修订 D2 和修订三；#38 入库、#39 播放和全长试验，#52 换成现在的 8 首、许可放宽到 CC-BY、改成交叉淡化循环）。

- **登记表**：`video/src/music/tracks.ts` 的 `MUSIC`（曲子 ID → 文件、曲名、作者、作品页、许可、核对日期、署名、采样率、采样数）。和音效登记表一样是纯 TypeScript 模块，Node 和 Remotion 共用。登记表用 `defineMusicLibrary` 定义，导入时就校验：许可只能是 `CC0` 或 `CC-BY x.y`（写版本号，如 `CC-BY 4.0`），别的（CC-BY-SA、OGA-BY 等）报错；CC-BY 必须写署名 `credit`（一行，照作品页的署名要求写曲名、作者、作品页、许可），没写报错；采样数不是一帧采样数的整数倍报错（30fps 下 44.1 kHz 一帧 1470 个、48 kHz 一帧 1600 个，这样曲长是整数帧，循环的起点不会被取整）。作品页同时给了几种许可时，登记我们选用的那一种。
- **曲子**（ID：曲名，作者，作品页上的许可）：`ooame`：Ooame，TAD，CC-BY 4.0 和 CC0；`iced-village`：Iced Village (8 Bit Lofi Hip Hop)，TAD，CC-BY 4.0 和 CC0；`the-past`：The Past (8 Bit Lofi Hip Hop)，TAD，CC-BY 4.0 和 CC0；`since-2-am`：Since 2 A.M.，TAD，CC0；`forgotten-path`：forgotten path，johndekale，CC0；`slow-melancholic-theme`：Slow Melancholic Theme C64 Style（带副歌的长版），skrjablin，CC-BY 3.0 和 CC0；`tiny-sad-lonely-theme`：Tiny sad lonely theme，MAOU，CC0；`kalypo`：Kalypo，Spring Spring，OGA-BY 3.0 和 CC0。都来自 OpenGameArt，2026-10-29 在作品页上核对过许可，用户给的文件和作品页上的下载文件逐字节相同（Iced Village、The Past 都有只给 CC-BY 的钢琴版或原版，用户给的是 8-bit lofi 版）。8 首都给了 CC0，都按 CC0 登记，所以现在没有曲子要署名。曲长从 40 秒（forgotten path）到 7 分 17 秒（Iced Village）；Iced Village 和 Kalypo 比一期正文长，不循环。
- **选曲**（#46，spec #16 用户故事 52、修订 D5）：`cd video && npm run music:pick -- <期目录>`（`video/src/music/pick-music.ts`）。期目录的分镜里已经有 `music` 时原样保留；否则找同一本书里按章、期的编号排序、排在本期之前、已经有分镜（带 `music`）的最近一期，只有字幕版（没有分镜）的跳过，从剩下的曲子里随机选一首（避开那一期的）；找不到这样的一期时从全部曲子里选。随机数由命令生成（`Math.random`），不让模型挑。选好的写进期目录的 `storyboard.json`：没有分镜时写一份只有 `music` 的骨架（`scenes`、`pauses` 为空），已有分镜时只加上 `music`。打印选中的曲子、许可、要不要署名，以及避开了哪一期的哪首。
- **署名**：时间轴导出时（`npm run timeline`、`pixelbook render`），用了 CC-BY 曲子的那一期在期目录的 `out/` 里写出 `credits.txt`（不提交）：一行 `配乐：<署名>`，可以直接贴进视频简介；用的是 CC0 曲子时不写，并删掉换曲之前留下的。和 `segments.txt` 一样，用 `--out` 写到 `out/timeline.json` 以外时不写。
- **文件**：`video/public/music/<ID>.ogg`，OGG/Vorbis（oggenc `-q 3`，约 110 kbps；两首单声道的原样是单声道），8 首共约 23 MB。不能放在 `video/public/episode/` 下：配音每次都会删掉那个目录。**曲子文件只留在本机，不进 Git**（`.gitignore` 忽略，spec #16 修订四，#53）；登记表照旧提交。新机器上照 `video/public/music/README.md` 下载、入库。缺文件时 `pixelbook render`、`music-trial`、`make smoke` 在渲染前报错并指向那份说明，`npm run music:seams` 也报错。
- **入库**（只在本机做，要 ffmpeg 和 oggenc，`brew install vorbis-tools`）：先在作品页上核对许可，把源文件放进一个目录（文件名见 `video/src/music/intake-music.ts` 的 `SOURCES`，就是用户给的 `Slowly Music` 目录里的原名），然后

  ```sh
  cd video
  npm run music:intake -- /path/to/downloads   # 写 public/music/<ID>.ogg，打印每首的采样率和采样数
  npm run music:seams                           # 交叉淡化接缝检查，打印一张 Markdown 表
  ```

  把打印出的采样率、采样数抄进登记表。入库命令对每首：解码（采样率高于 48 kHz 的降到 48 kHz：Kalypo 的 FLAC 是 96 kHz）→ 去掉首尾低于 -60 dBFS 的静音（`trimSilence`，每首都做：MP3 解码出的编码器补的头尾静音，和曲子本身开头结尾的空白，比如 Iced Village 曲尾约 3 秒）→ 截掉曲尾不满一帧的零头，采样数对齐到一帧的整数倍（交叉淡化循环不要求曲尾接得上曲首，#38 给无缝循环用的按周期重采样已经去掉）→ oggenc 编码 → 用 ffprobe 的 `duration_ts` 核对编码后的采样数（不用 `format=duration`）。
- **交叉淡化接缝检查**：`npm run music:seams` 解码登记表里的每首曲子，照播放时的做法把曲尾和曲首重叠 1 秒（增益按帧取，`video/src/music/seam.ts` 的 `measureCrossfade`），量：重叠处每 50 毫秒的电平比曲尾、曲首各自的功率之和低 6 dB 以上（互相抵消），或重叠处整体比前后各 1 秒都低 6 dB 以上，算**掉音**；重叠处整体比前后都高 6 dB 以上，或混合后削波，算**爆音**。有一首掉音或爆音就以非零码退出。表里还列出重叠里的曲尾、曲首比整首（100 毫秒窗口的中位数）轻多少 dB：完整的歌多半以淡出结尾、以渐强开头（TAD 的几首曲尾比整首轻 27–43 dB），接缝处会有几秒很轻，这不算掉音，听感留到人工关口 3。
- **播放**：分镜顶层的 `music` 写曲子 ID（必填，没登记的报错）。`planEpisode` 输出 `music`：曲子 ID `track`、开始帧 `startFrame`（片头结束的那一帧，即 422；不用片头时为 0）、结束帧 `endFrame`（不含，正文结束、片尾开始的那一帧；不用片尾时是总帧数）和淡出起始帧 `fadeFrom`（`endFrame` − 60，即正文最后 2 秒；正文不到 2 秒时从 `startFrame` 起）；没有分镜（字幕版）时为 `null`，不放配乐。Episode 在合成顶层放配乐（`video/src/music/EpisodeMusic.tsx`），从片头结束放到正文结束，不覆盖片头（#50）和片尾（#51）。
  - **循环**（`video/src/music/crossfade.ts` 的 `musicPlays`）：曲长不短于正文时只放一次。比正文短时每次循环比上一次晚「曲长 − 30 帧」开始，和上一次的最后 30 帧（1 秒，`CROSSFADE_FRAMES`）重叠，直到下一次的起点到了正文结束；最后一次在 `endFrame` 截断。每次循环一个 `Sequence`，各放一份曲子，**不用 Html5Audio 的 `loop`**（#39 实测它在接缝处有约一帧的数字静音）。
  - **音量**（`musicVolume`）：`VOLUME.music`（-20 dB），交叉淡化处曲尾按 cos、曲首按 sin 淡化（等功率：两份的功率之和不变，曲尾和曲首不相关时响度不掉；每帧取帧中点，第一帧不是 0、最后一帧不是 1），再乘正文最后的线性淡出（`fadeFrom` 到 `endFrame` 降到 0）。音量用 `useCurrentFrame` 在顶层算成数值传给每份曲子，**不用 `volume` 回调**：回调拿到的是 Sequence 里的帧数，每次循环都归零。一份音频在它的时间段里音量有变化时，Remotion 渲染时把音量取整到 1/97 的整数倍（`@remotion/renderer` 的 `roundVolumeToAvoidStackOverflow`，ffmpeg 表达式深度的限制），并且按帧中点、按音频包切换：0.1 被取成 10/97（约 -19.7 dB），淡出是约 10 级台阶（每级约 6 帧），最后约 3 帧是 0。
  - 时间轴导出命令把 `music`（外加文件 `file`、曲长 `trackFrames`、每次循环 `plays`（`from`、`to`、交叉淡化的帧区间 `fadeIn`、`fadeOut`，没有为 `null`）、音量 `volumeDb`）写进 `timeline.json`，没有配乐时是 `null`。
- **只有配乐的声轨**：Studio 里另有一个合成 `EpisodeMusic`，和 Episode 用同一份排期，只放配乐，不放旁白和音效，用来单独检查交叉淡化和淡出。
- **全长试验**（#39，#52 改成交叉淡化）：`cd tools && uv run pixelbook music-trial ../books/<书>/<章>/<期>/script.yaml [--storyboard 试验分镜.json]` 先像 `pixelbook render` 一样出片到 `out/<书>-<章>-<期>.mp4`，再把 `EpisodeMusic` 渲染成 `out/<书>-<章>-<期>-music.wav`，然后检查（`tools/src/pixelbook/music_check.py` 的 `check_music`）：
  - 音频流和视频流一样长（相差不超过一帧）；配乐声轨在 `startFrame` 之前（片头期间）和 `endFrame` 之后（片尾期间）每帧都低于 -50 dBFS。
  - **参照**：照 `timeline.json` 的 `plays` 把原曲放出来（`music_reference`，numpy 混音，音量公式和 `musicVolume` 一样，在 Python 里独立写一遍，取整同 Remotion），写成 `out/<书>-<章>-<期>-music-reference.wav`，可以拿来对着听。每次循环像 Remotion 那样放在**整毫秒**上：Remotion 用 `adelay=<毫秒>` 摆放每份音频，第 f 帧放在 round(f / 30 × 1000) 毫秒，帧号除以 3 余 1 的早 1/3 毫秒、余 2 的晚 1/3 毫秒（48 kHz 下 16 个采样）。配乐声轨和参照逐帧比 RMS（`astats`），差取中位数；每帧的电平超出「前后一帧的参照电平加上整体的差」±1 dB 算问题（交叉淡化处掉音、爆音，淡出没做或做错）。前后一帧放宽，是因为 Remotion 的音量台阶按帧中点、按音频包切换，台阶边上的帧和参照对不齐。参照低于 -60 dBFS 的帧（曲子里的停顿、淡出的最后几帧）不比。淡出不再单独查「逐帧不回升」：它和交叉淡化一样折算进了参照。#39 的旧检查在 #50、#51 的试验里报的回升是测量误差：旧参照把每次循环放在整帧上，比 Remotion 早 16 个采样，音符起音碰到帧边界时逐帧的差会抖，淡出前段每帧只降约 0.15 dB，抖动就成了「回升」（见 #52 的评论）。
  - 每段交叉淡化前后 1 秒，声轨和成片里都没有参照之外的静音（`silencedetect`，低于 -50 dBFS、20 毫秒以上；曲子里本来就有的停顿参照里也有）。
  - 每段交叉淡化打印一行，有问题时以非零码退出。`--storyboard` 在出片期间临时换上这份分镜，结束后把期目录里的分镜恢复原样（原来没有就删掉）；ch02 ep01 的试验分镜是 `video/src/episode/fixtures/ep01-music-trial.storyboard.json`（每个画面一个知识块，配乐用最短的 forgotten path，`npm run test` 检查它能排期）。
- `npm run test` 检查：登记的每首曲子的文件名就是 ID、放在 `music/` 里；记了核对日期和作品页；文件是 OGG/Vorbis，采样率和采样数（读 OGG 最后一页的 granule position）与登记表一致，采样数是一帧采样数的整数倍；`music/` 里除了 `README.md` 没有没登记的文件。曲子文件不进 Git，CI 上没有：缺的那几首跳过读文件的检查（OGG 格式、采样率、采样数），打印一行「本机缺配乐文件 …」说明缺哪几首、去看 `video/public/music/README.md`；其余检查照常跑；`defineMusicLibrary` 收 CC0、CC-BY，拒绝别的许可，CC-BY 缺署名、采样数没对齐时报错；`writeCredits` 用了 CC-BY 曲子时写出署名、CC0 时不写；`musicPlays`、`musicVolume` 排出的循环起点、重叠帧数、淡化曲线，比正文长的曲子不循环。选曲命令保留已有的 `music`、本书第一期从全部曲子里选、上一期在另一章、跳过只有字幕版的一期、结果不等于上一期的曲子；`measureCrossfade` 用合成的波形测过：不相关的曲尾曲首不掉音、反相抵消报掉音、重叠处突然变响报爆音。

### 组件目录

写分镜能用的 7 个组件（`/storyboard` 只读这一节和上面的「分镜」来写分镜，所以这里写全）。每个组件一个小节，依次写：用途、参数、占几格、状态、默认动画、默认音效，后面是细节。通用的规则不在这里重复：动作和 `animation` 的取值见「分镜」，摆放见「网格」「嵌套」，字放不下怎么算见「字宽估算」，显示文字的出处见「显示文字」，音效 ID 见「音效」。

- 入场时组件处在**第一个状态**（初始状态），只响入场音效；之后切回初始状态时才响初始状态的音效。音效写「不放」的，切到那个状态时没有声音。
- 入场、退场都能用通用动画 `fade`、`slide`、`none`；表里只写不写 `animation` 时用的默认动画，和组件自己的特殊效果。
- 「显示文字」参数的值必须出自本画面的画面说明或旁白句。
- `npm run test` 检查这一节列出了组件注册表里的每个组件（每个组件一个 `#### 中文名 \`组件名\`` 小节），并写出了它声明的每个状态名（`video/src/components/catalog.test.ts`）。
- 7 个组件依次演一遍的样片：合成 `ComponentSamples`（把下面每个组件的 `Sample-<组件名>` 首尾相接），`cd video && npx remotion render ComponentSamples ../out/component-samples.mp4`。

#### 知识块 `PixelBlock`

- **用途**：书里的一个概念、一段知识、一份东西（代码、文档、数据库 Schema）。能表现落下、复制、高亮、只改了一处（spec #16 用户故事 32）。
- **参数**：`label` 一行字（显示文字）；`size` 是 `small`、`medium`、`large`；`color` 是风格表 `BLOCK_COLORS` 里的名字：`orange`、`green`、`blue`、`purple`、`cream`、`stone`（黄色和红色留给状态）。
- **占几格**：按 `size`，见下表。
- **状态**：`normal`（初始，深色描边和阴影）、`highlight`（描边和阴影变黄）、`changed`（已改，描边和阴影变红）。切到后两种时跳一下（`SIZE.blockHop`，0.4 秒）。
- **默认动画**：入场 `slide`（从上方落下），退场 `fade`。
- **默认音效**：入场 `drop`、退场 `leave`，切到 `normal`、`highlight` 时 `blip`，切到 `changed` 时 `buzz`。
- **嵌套**：`large` 的标签只占中间一行（`[0, 1]` 起 4×1 格；行高 128 像素居中，字形落在中间一行里），上下两行可以嵌子组件；`medium`、`small` 的标签占满整个方块，不能嵌子组件。

方块占满格子，右下留出硬阴影的偏移，标签单行居中、不换行、不加字距。`size` 同时决定占几格和标签的字号：

| `size` | 占几格（列 × 行） | 字号 | 标签最多多宽 |
| --- | --- | --- | --- |
| `small` | 2 × 1 | 24（`FONT_SIZE.small`） | 216 像素（9 个汉字） |
| `medium` | 3 × 2 | 48（`FONT_SIZE.subtitle`） | 364 像素（7 个汉字） |
| `large` | 4 × 3 | 96（`FONT_SIZE.large`） | 512 像素（5 个汉字） |

标签最多多宽 = 格子宽 − 两侧粗描边 `SIZE.strokeThick` − 硬阴影 `SIZE.shadowOffset` − 两侧内边距 `SIZE.blockPadding`。放不下时报错：换大一号的 `size` 或缩短标签。

样张：`Sample-PixelBlock`（三种入场和退场动画；六种颜色；入场、高亮、已改、切回、退场；最后一个画面演嵌套）。

#### 小人 `Mascot`

- **用途**：Q 版频道小人，一个或一群，分镜里需要「人物做什么」时才用：一群上师和大神、程序员头顶冒问题（spec #16 用户故事 37，修订 D1）。

  ```json
  { "id": "host", "component": "Mascot", "props": { "character": "reader" }, "at": [0, 1] }
  { "id": "gurus", "component": "Mascot", "props": { "character": ["dragon", "whale", "gothic", "reader"], "count": 5, "formation": "crowd" }, "at": [3, 2] }
  ```

- **参数**：`character` 是 Q 版角色（按外观起名：`dragon`、`reader`、`whale`、`gothic`，见风格表 `MASCOTS`），一群人时可以写一串，从左往右一人一个，不够时从头循环；`count` 几个人（≥ 1，不写是 1）；`formation` 排法，`row`（不写时）或 `crowd`。没有显示文字。
- **占几格**：一个小人 2 列 × 3 行。`row` 每人隔一块格子的宽，占 `2 × 人数` 列 × 3 行（一排最多 6 人占满 12 列）；`crowd` 每人只隔一列、左右挤着有一点遮挡，从 0 数的单数位站后排、比前排高一行、被前排挡住，占 `人数 + 1` 列 × 4 行（只有一个人时和 `row` 一样，2 × 3）。超出网格照常报越界。
- **状态**：`normal`（初始，头顶没东西）、`question`（头顶冒问号）、`exclaim`（头顶冒感叹号）。一群人一起冒同一个符号。
- **默认动画**：入场、退场都是 `fade`。
- **默认音效**：入场 `pop`、退场 `leave`，冒问号 `blip`，冒感叹号 `ding`，切回 `normal` 不放。
- **尺寸**（#42 人工关口，用户选了 1/2 缩小）：图片按原图的 1/2（风格表 `MASCOT_SCALE`、`mascotSize`，四舍五入到整数像素）、最近邻插值显示，约 187–220 × 280–296 像素。一个小人的格数由 `mascotCells()` 算：最宽、最高的角色按显示尺寸向上取整到整格，高度还要放下头顶的符号；在自己那块格子里底边对齐、水平居中。
- **符号**：从下面升上来、淡入（一个通用动画的时长），之后每 0.5 秒（`MOTION.mascotSymbolBobSeconds`）上下浮动一格像素；切回 `normal` 时原地淡出。符号是风格表 `MASCOT_SYMBOLS` 里的 5×7 点阵（每点 `SIZE.mascotSymbolDot`，外面一圈 `ink` 描边），不是字体里的「？」「！」（组件不渲染参数以外的固定文字）；颜色 `COLOR.mascotQuestion`（黄）、`COLOR.mascotExclaim`（红）。符号画在小人自己的格子里，不压到上面的组件（`mascot-look.test.ts` 检查）。
- 图片不是对齐网格的像素画，1/2 后「像素」大小不一，1 像素宽的描边有些地方断续（用户看过样帧认可）。图片是从 `character/Q.png` 裁出的透明底 PNG（`video/public/character/`，裁图脚本 `character/crop_q.py`）。

样张：`Sample-Mascot`（四个角色四种入场和退场动画；一个小人冒问号、换感叹号、切回；三人一排一起冒问号，五人一群一起冒感叹号）。

#### 箭头 `Arrow`

- **用途**：从一个组件指到另一个组件，表现「指向 ETC」「改一处要连带改三处」（spec #16 用户故事 20、21、33）。

  ```json
  { "id": "dry-etc", "component": "Arrow", "props": {}, "from": "dry", "to": "etc" }
  ```

- **参数**：没有（`props` 写 `{}`）。是连线类组件：不写 `at`、不写 `parent`，`from`、`to` 必须都写，必须是本画面里两个不同的、按格子摆放的组件（不能指向另一个箭头）。不是连线类组件的写了 `from`、`to` 也报错。
- **占几格**：不占格，不参加重叠检查；画法按两端组件的位置算。
- **状态**：`normal`（初始，深色）、`highlight`（黄色的芯加深色描边）。
- **默认动画**：入场、退场都是 `fade`。入场时箭杆从起点长到终点（按入场进度），外面再套入场动画。
- **默认音效**：入场 `pop`、退场 `leave`，切到 `normal`、`highlight` 都是 `blip`。
- **时间**：箭头在画面上的区间（从入场帧到退场动画播完，没有退场的到画面结束）必须完全落在两端组件各自的区间里：和端点同一帧入场、同一帧离开画面都合法；早于某一端入场，或某一端已经离开画面时箭头还在，都报错（报出第几个画面、第几个组件、箭头和那一端的帧区间）。端点退场时，箭头要一起退场（同样长的退场动画，或更早）。
- **画法**：沿两端矩形中心的连线，从起点组件的边框外 `SIZE.arrowGap` 出发，尖停在终点组件边框外 `SIZE.arrowGap`；粗箭杆（`SIZE.strokeThick`）加三角形箭头头（`SIZE.arrowHeadLength`、`SIZE.arrowHeadHalfWidth`），坐标取整到像素网格，不抗锯齿。两端挨得太近、放不下箭头头时不画。端点在网格上怎么摆，箭头就怎么斜，所以摆放时两端之间要留出空档，箭杆不要穿过别的组件（这一条没有检查，靠看样帧）。
- 箭头画在组件列表里它的位置上（后写的画在上面），一般写在两端组件后面。

样张：`Sample-Arrow`（一个知识块指向另一个，高亮、切回、退场；一个知识块指向三个，三种入场和退场动画）。

#### 提示牌 `HintSign`

- **用途**：书里的提示框，显示编号和提示标题，带亮起的入场效果（spec #16 用户故事 34）。

  ```json
  { "id": "tip", "component": "HintSign", "props": { "label": "提示", "number": "14", "title": "ETC" }, "at": [1, 1] }
  ```

- **参数**：`label`、`number`、`title`，三个都是显示文字。上面一条橙色标题牌写 `label` 和 `number`（字号 `subtitle`），下面是大号的提示标题 `title`（字号 `large`，单行）。「提示」两个字也由 `label` 传入，组件里不写死；`number` 是字符串，例如 `"14"`，画面说明里写了「提示14」才能用。标题和标题牌最多 660 像素宽（格子宽减去两侧粗描边、硬阴影偏移和两侧内边距，大号字约 6 个汉字），放不下报错。
- **占几格**：5 列 × 3 行。
- **状态**：只有一个，`normal`。
- **默认动画**：入场是它自己的特殊效果 `light`（亮起，`MOTION.hintLightSeconds` 0.8 秒）：牌子先是暗的（`COLOR.hintUnlit`），闪一下、灭掉，从一半起亮住，外面扩出一圈黄光（`COLOR.hintGlow`）后消失。退场 `fade`；退场写 `animation: "light"` 时倒着播，即熄灭。`light` 只有提示牌能用。
- **默认音效**：入场 `ding`、退场 `leave`。
- **嵌套**：整块都是字（`labelArea` 是整块），不能嵌子组件。

样张：`Sample-HintSign`（亮起、亮着、熄灭；三块提示牌三种入场和退场动画）。

#### 电脑 `Computer`

- **用途**：一台老式显示器加底座，能正常也能崩溃，表现柯克船长的开场（s04-c01）和 s05-c03 前后呼应（spec #16 用户故事 36）。

  ```json
  { "id": "computer", "component": "Computer", "props": { "screen": ["两条", "自相矛盾的知识"] }, "at": [7, 1] }
  ```

- **参数**：只有 `screen`：屏幕上的字（显示文字，逐行检查），一项一行，最多 3 行，可以是空数组（屏幕上没有字）。每行字号 `subtitle`，最多 448 像素宽（约 9 个汉字），放不下报错。屏幕上要出现「ERROR」之类的字，也要写进 `screen`。
- **占几格**：4 列 × 4 行。
- **状态**：`normal`（初始，深色屏幕绿字，最后一行后面一个光标一亮一灭）、`crashed`（切过来的 0.8 秒里左右抖动、红白闪屏、冒出花屏横条，之后停在蓝屏，每行字比上一行往下错开一点，横向不动）。可以从 `crashed` 切回 `normal`（重启）。
- **默认动画**：入场、退场都是 `fade`。
- **默认音效**：入场 `pop`、退场 `leave`，切到 `crashed` 时 `crash`，切回 `normal` 时 `blip`。
- **嵌套**：上面三行格是屏幕（`labelArea`），子组件只能嵌在底座那一行。
- 颜色（`COLOR.computer*`）、尺寸（`SIZE.computer*`）、时长（`MOTION.computerCrashSeconds` 等）都在风格表里；提示牌和电脑增补的颜色在风格样张的「用途色」一节里能看到。

样张：`Sample-Computer`（入场、崩溃、重启、退场；三台电脑三种入场和退场动画，最后一台屏幕上没有字）。

#### 岔路 `Fork`

- **用途**：一个路口加几条路，可以标出某条路，也可以给某条路放上或撤掉路障：ETC 向导站在分岔口、看不出哪条路好改、整块替换时没有路障（spec #16 用户故事 35）。

  ```json
  { "id": "fork", "component": "Fork", "props": { "roads": 3, "labels": ["好改", "难改", "看不出"] }, "at": [5, 1] }
  ```

- **参数**：`roads` 几条路（2–4 条，从上往下数，第 1 条在最上面）：左边一段路进路口，分岔的竖路往右分出这几条路。`labels` 可选：每条路的标签（显示文字，逐项检查），项数必须等于 `roads`；字号 `subtitle`，写在路障右边，最多 480 像素宽（`forkLabelRoom()`，约 10 个汉字），放不下报错。不写 `labels` 就是不带字的路。
- **占几格**：6 列 × 4 行。
- **状态**：`normal`（初始，什么都没有）；`mark-1`、`mark-2`、`mark-3`、`mark-4`（标出第 N 条路：路面从路口往右铺成黄色）；`block-1`、`block-2`、`block-3`、`block-4`（在第 N 条路上放路障：红白条纹的路障从上方落下）。序号不能超过 `roads`（见「带序号的状态」）。一次只处在一个状态：从 `block-N` 切到别的状态就是撤掉路障（路障抬起消失），所以「标出一条路，同时另一条有路障」表现不了，要的话再加状态。动画都用一个通用动画的时长。
- **默认动画**：入场、退场都是 `fade`。
- **默认音效**：入场 `pop`、退场 `leave`，切到 `mark-N` 和 `normal` 时 `blip`，切到 `block-N` 时 `drop`。
- **嵌套**：写了 `labels` 时整块都算标签（`labelArea`），不能嵌子组件；不写字时可以嵌。

样张：`Sample-Fork`（四条带字的路逐条标出、逐条放路障、撤掉、退场；两条、三条不带字的路三种入场和退场动画）。

#### 时间线 `Timeline`

- **用途**：一条横轴加几个带字的节点，节点可以逐个点亮：开发时间线、工程日志（spec #16 用户故事 38）。

  ```json
  { "id": "timeline", "component": "Timeline", "props": { "nodes": ["起点", "开发过程", "发布"] }, "at": [3, 2] }
  ```

- **参数**：`nodes` 是节点下面的字（2–6 项，从左往右；显示文字，逐项检查）。字号 `subtitle`，每项最多 264 像素宽（`timelineLabelRoom()`，约 5 个汉字），放不下报错。
- **占几格**：每个节点 2 列，所以 `2 × 节点数` 列 × 2 行（上一行横轴和节点，下一行字）。
- **状态**：`normal`（初始，一个都没点亮）；`lit-1`、`lit-2`、`lit-3`、`lit-4`、`lit-5`、`lit-6`（点亮了前 N 个节点）。序号不能超过节点数（见「带序号的状态」）。从点亮较少的状态切到 `lit-N` 时，横轴从上次亮到的地方沿着往右亮过去（每多一个节点多 0.4 秒），亮光走到的节点变黄、字变深；熄灭（切到较少的 `lit-N` 或 `normal`）是一下子变的。
- **默认动画**：入场、退场都是 `fade`。
- **默认音效**：入场 `pop`、退场 `leave`，切到 `lit-N` 时 `ding`，切回 `normal` 不放。
- **嵌套**：下一行是字（`labelArea`），子组件只能嵌在横轴那一行。

岔路、时间线的颜色（`COLOR.fork*`、`COLOR.timeline*`）、尺寸（`SIZE.fork*`、`SIZE.timeline*`）在风格表里，风格样张的「用途色」一节能看到。样张：`Sample-Timeline`（六个节点逐个点亮、全部熄灭、一口气点亮、退场；三条两节点的时间线三种入场和退场动画）。

### 时间轴、打点时间表与试听音轨

停顿规则只在 TypeScript 的时间轴函数里（`video/src/episode/timeline.ts`）。想听逐句配音按停顿排好后的整体效果，先导出时间轴，再拼一条试听音轨（不是正式产物，渲染时 Remotion 仍逐句放音频）：

```sh
cd video
npm run timeline -- ../books/sample/ch01/ep01        # 写出期目录 out/ 里的 timeline.json 和 segments.txt
cd ../tools
uv run pixelbook mix ../books/sample/ch01/ep01/out/timeline.json   # 拼到 out/mix/sample-ch01-ep01.wav
```

- `npm run timeline` 读产物目录 `out/` 里的合成清单 `episode.json`，有分镜时也读期目录里的分镜（取它的停顿覆盖，分镜不合格就报错），用和 Remotion 渲染时同一个 `planEpisode` 算出 `out/timeline.json`（不提交）：帧率 `fps`、总帧数 `totalFrames`（片头 + 正文 + 片尾）、片头的帧数 `introFrames`（正文从这一帧开始）、片尾的帧数 `outroFrames`（最后这么多帧是片尾，见「片头和片尾」），每个旁白句（`lines`）、画面（`scenes`）、段（`segments`）的 `startFrame`（含）和 `endFrame`（不含）。旁白句的 `endFrame` 是音频结束、不含之后的停顿；正文到最后一句音频结束为止，最后一个画面和段到这里结束，之后是片尾。
- 同一个命令还在 `out/` 里写出打点时间表 `segments.txt`（不提交）：每段一行 `00:00 段标题`，时间是该段开始帧换算成秒后向下取整，不到 1 小时用 `mm:ss`，超过用 `h:mm:ss`，可以直接贴到视频平台的分段设置。第一行是 `00:00 片头`（平台的分段要从 00:00 开始），正文各段写真实的开始时间（片头之后）。片尾每期都一样，不列。用 `--out` 写到 `out/timeline.json` 以外时不写打点时间表，免得试听用的时间轴覆盖正式的。
- 配乐要署名（用了 CC-BY 的曲子）时，同一个命令还在 `out/` 里写出 `credits.txt`（不提交，一行，贴进视频简介），并打印一行；CC0 的不写（见「配乐」）。
- 命令最后打印总时长（`m:ss`，含停顿，向下取整到秒）和 4:00–6:00 的判断（在范围内 / 太短 / 太长，两端都算在范围内，按显示的整秒判断）；判断也写进 `timeline.json` 的 `duration` 字段（`seconds`、`text`、`verdict`：`within` / `too-short` / `too-long`，`verdictText`：判断的说明文字，`pixelbook render` 的汇总原样打印它；`intro`、`body`、`outro`：片头、正文和片尾各自的 `seconds`、`text`，不用片头时 `intro` 是 `null`，不用片尾时 `outro` 是 `null`；正文从片头结束到片尾开始）。判断按含片头和片尾的总时长；命令和 `pixelbook render` 的汇总在总时长后面写「（片头 m:ss，正文 m:ss，片尾 m:ss）」。样片阶段只报告，不以非零码退出。
- 只想听默认停顿、不要分镜里的覆盖时，加 `--no-storyboard`，再用 `--out` 写到别处，免得覆盖 `out/timeline.json`：`npm run timeline -- ../books/sample/ch01/ep01 --no-storyboard --out ../out/mix/sample-ch01-ep01-default-pauses.timeline.json`，然后 `uv run pixelbook mix ../out/mix/sample-ch01-ep01-default-pauses.timeline.json --out ../out/mix/sample-ch01-ep01-default-pauses.wav`。
- 试听音轨只有旁白，不含片头片尾的音轨和音效（只在 Remotion 渲染时放）；时间轴里正文从片头之后开始，所以试听音轨开头有片头长度（约 14 秒）的静音，结尾有片尾长度（10.8 秒）的静音。
- `pixelbook mix` 只读 `timeline.json`，不知道停顿是多少秒：每句的 wav（`audio`，以 `video/public/` 为起点）从"开始帧 ÷ 帧率"秒处开始，其余是静音，补到时间轴的总时长。拼完测量音轨，和时间轴总时长相差超过一帧就报错。`timeline.json` 格式不对时逐个写明字段位置。它用的是 `video/public/episode/` 里的 wav，所以要在 `pixelbook voice` 之后、对同一期导出时间轴；重新配音后要重新导出。

## 风格表、字体与频道形象

- 风格表在 `video/src/style/style.ts`：16 色调色板 `PALETTE` 和按用途取色的 `COLOR`、像素网格 `GRID`（4px，画面上一个"像素"）、字号 `FONT_SIZE` 与行高、尺寸 `SIZE`（都是网格的整数倍）、描边 `border`、硬阴影 `hardShadow`、描边字 `outlinedText`。组件（`src/components/`，包括子目录里的常驻组件）里的颜色和尺寸只能引用这些常量，`npm run test` 递归扫描这个目录，检查源码里有没有写死的颜色值和数字（0、1 除外）。
- 字体：Fusion Pixel 12px 比例宽度简体（OFL 1.1，来源和许可在 `video/public/fonts/`）。字形画在 12×12 格上，字号只能是 12 的整数倍（现在用 24 / 48 / 96），否则会模糊；测试检查这一点。字体由 `src/style/font.ts` 在第一帧之前加载。
- 画面左上角常驻这一期的主题：旁白稿顶层的 `title`（等于大纲里这一期的 `topic`），经合成清单 `episode.json` 的 `title` 传进成片，由常驻组件 `src/components/resident/EpisodeTitle.tsx` 显示（橙字深色描边）。代码里没有写死的频道名。
- 频道小人不常驻画面，是一个通用组件 `Mascot`（见「组件目录 › 小人」）：分镜里需要"人物做什么"时才用。小人图不是对齐网格的像素画，只能按原尺寸、整数倍或 1/2 显示，最近邻插值；现在统一按 1/2（`MASCOT_SCALE`，#42）。
- 字幕只在显示时去掉分句标点 `，。、；`：句中的换成一个空格，句末（和句首）的直接去掉，紧挨在右引号、右书名号、右括号前的也直接去掉（`他说：“好的。”` 显示为 `他说：“好的”`）；`：“”‘’《》（）——？！` 保留（`video/src/components/resident/subtitle-text.ts`）。旁白脚本、配音、语音识别核对、合成清单和缺字检查都用原句。
- 中间帧格式是 PNG（`video/remotion.config.ts`），JPEG 会让像素边缘出现杂色。

## 检查

先运行过 `make install`，再运行：

```sh
make check
```

依次运行 pytest、ruff（lint + 格式）、`tsc`、ESLint、Vitest，任何一项失败就以非零码退出。"做完了"的标准就是这条命令通过。

能写成代码的检查和统计都放在 `pixelbook` 命令里（`units`、`outline`、`check`、`factcheck-prompt` 等），带测试；skill 只跑这些命令，做需要判断的事（写大纲、写稿、语义核对），不让智能体写一次性脚本自查。

GitHub Actions（`.github/workflows/check.yml`）在每个 PR 和推送到 main 时，在 Linux 上跑同一条 `make check`。私有仓库设不了「合并前必须通过」，合并 PR 前自己看一眼 Checks 是否全绿。

冒烟测试单独一条命令（要真实渲染，慢一些，所以不在 `make check` 里）：

```sh
make smoke
```

它用 `tools/smoke/episode/` 里的固定小样例（4 句、带分镜和 `title`），把真实 TTS 和语音识别换成假引擎（静音 wav，不加载任何模型），在临时目录里经 `pixelbook render` 走完四步，再用 ffprobe 解码数出 MP4 视频流的帧数，和 `timeline.json` 的总帧数比，相差不超过一帧。样例的配乐是 48 kHz 的 Kalypo（曲子文件只在本机，缺了就在渲染一步报错并指向 `video/public/music/README.md`；旁白、音效是别的采样率，顺带验证混音时的重采样；正文比曲子短，只放一次），所以成片里的声音是片头片尾的音轨、配乐和音效（假旁白是静音）。它先查片头片尾（#50、#51）：时间轴的 `introFrames` 是 422、`outroFrames` 是 324，第一句从第 422 帧开始，最后一句（旁白稿的最后一句，配音不再追加片尾）在片尾开始那一帧结束，配乐的 `startFrame` 是 422、`endFrame` 是片尾开始那一帧，片头和片尾期间成片的逐帧电平和它们的音轨一样（响的帧相差不超过 1 dB，没有配乐叠上去），打点时间表从 `00:00 片头` 开始。再照排期把原曲从片头结束放到正文结束当参照（`music_reference`，和全长试验同一个），逐帧比 RMS（ffmpeg `astats`），检查分镜里的每个音效（样例用到了全部 7 个）在它的帧比配乐高出 3 dB 以上、第一个音效之前只有配乐；片头之后、淡出之前成片里没有参照之外的静音（`silencedetect`）；音频流和视频流一样长；三个不同的音效同时响起时峰值低于 -1 dBFS（只量正文，片头片尾的音轨本身约 -1 dBFS）。它验证的是渲染管线、时长和声音的时机，不是音质。配音缓存、锁定音色、Remotion 静态目录和 MP4 都在临时目录里，不碰 `books/`、`video/public/episode/` 和 `out/`。改了配音流水线、时间轴或 Remotion 之后跑一次。

## 预览

先运行过 `pixelbook render`、`pixelbook voice` 或 `stage`，再：

```sh
cd video && npm run studio
```

在 Studio 里打开 `Episode` 合成。`Intro-<ID>`、`Outro-<ID>` 合成单独放登记的每个片头片尾（见「片头和片尾」）。`StyleSheet` 合成是风格样张（调色板、用途色、字体、描边和阴影、字幕框），`Sample-<组件名>` 是各组件的样张（见「分镜」），都只在 Studio 里看，渲染命令只渲染 `Episode`；要导出成图片：`npx remotion still StyleSheet ../out/style-sheet.png`。
