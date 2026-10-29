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
- **`minutes`**：正数，可以是小数（`1.5` 是 1 分 30 秒）。
- **`cite`**：写法和旁白稿相同。

检查（只检查，不生成任何东西）：

```sh
cd tools
uv run pixelbook outline ../books/pragmatic-programmer/ch02/outline.yaml
```

通过时退出码 0，否则 1。先查格式（缺字段、多出不认识的字段、类型不对、期 ID 不是 `epNN`、`cite` 写成范围），格式错时报第一处；格式对了再一次列出下面所有问题，每条指出哪一期、哪个字段：

- `chapter` 和章目录不一致；
- 期 ID 重复，同一期里段标题重复，观点 ID 在整份大纲里重复；
- 一期的段数不在 4–6 内；
- 一期各段 `minutes` 的总和不在 4:00–6:00 内（含两端）；
- `units` 里的单元在转换结果里没有，或段落范围不在这个单元里、首尾颠倒；
- `cite` 里的编号在这一章的转换结果里不存在。

转换结果不存在时先跑 `pixelbook convert`。

## 从旁白稿到 MP4

旁白稿放在 `books/<书>/<章>/<期>/script.yaml`（样例：`books/sample/ch01/ep01/script.yaml`）。顶层的 `title` 必填，是这一期的书名或主题名，显示在画面左上角（样例里是示例值「读一本8bit像素书」），缺了或为空时 `voice` 报错。

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
   | 1 配音 | 同 `pixelbook voice`：新术语检查、音色锁定守卫、缺字检查、逐句配音与复核，复制到 `video/public/episode/` | 新术语、音色和锁定不一致、缺字、配置文件写错 |
   | 2 时间轴 | 同 `npm run timeline`：校验分镜（含组件触发帧是否落在画面里），写出 `timeline.json` 和 `segments.txt` | 分镜不合格 |
   | 3 渲染 | `remotion render Episode`（只渲染成片，不渲染风格样张） | Remotion 报错（附上输出的最后几行） |
   | 4 核对时长 | 用 ffprobe 数 MP4 **视频流**的帧数，和 `timeline.json` 的总帧数比，相差超过一帧就算失败 | — |

   全部通过后打印汇总报告：MP4 路径、帧数、总时长和 4:00–6:00 的判断、打点时间表位置、复核未通过的句子（需要试听）、靠拼音通过的句子（只列出备查）。**复核未通过和总时长超出范围不算失败**，只列在汇总里。

   `--out <路径>` 改输出位置；`--revoice` 同 `voice --revoice`（音色和书的锁定音色不一致、确认整本书换音色时用）。

3. 看汇总报告：试听复核未通过的句子，读错了就删缓存再跑一遍；看 MP4。改了分镜只要再跑一遍 `render`，配音全部命中缓存，不会重新生成。

分步运行（排查某一步时用）：

```sh
cd tools
uv run pixelbook voice ../books/sample/ch01/ep01/script.yaml   # 逐句配音，生成合成清单
cd ../video
npm run timeline -- ../books/sample/ch01/ep01                   # 时间轴、打点时间表、总时长
npm run render -- ../out/sample-ch01-ep01.mp4                  # 渲染 MP4
```

`voice` 先按读音表检查新术语（见下），没有新术语才用这本书的音色（见下文“书的音色与锁定”）逐句配音，写出期目录里的合成清单 `episode.json`，再清空 `video/public/episode/`，把每句 wav 和合成清单复制进去。Remotion 只读 `video/public/episode/episode.json`。

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

`voice` 还检查字幕文本里的每个字在像素字体（`video/public/fonts/` 里的 Fusion Pixel）里有没有字形：缺字时浏览器会换成系统字体，画面上混进一个不是像素风的字。左上角的书名/主题名 `title` 也一样检查。缺的字列进检查报告的 `missing_glyphs`（旁白句 `id` 和字 `char`；书名/主题名里缺的字，`id` 记作 `title`），`voice` 打印出来并以非零码退出。这项检查在配音之前做：有缺字就不配音，合成清单、`video/public/episode/` 和锁定音色都不动，检查报告里只有 `missing_glyphs` 一项。改写那句字幕（或者换字体）后再配音。空白不检查。

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
- 画面左上角常驻这一期的书名或主题名：旁白稿顶层的 `title`，经合成清单 `episode.json` 的 `title` 传进成片，由外壳组件 `src/shell/EpisodeTitle.tsx` 显示（橙字深色描边）。代码里没有写死的频道名。
- 频道小人不常驻画面，是一个通用组件 `Mascot`：分镜里需要"人物做什么"时才用，参数 `character`（Q 版角色，按外观起名：`dragon`、`reader`、`whale`、`gothic`，见 `style.ts` 的 `MASCOTS`）和 `position`（站在画面底部的 `left` / `center` / `right`），例如 `{ "id": "host", "component": "Mascot", "props": { "character": "reader", "position": "left" } }`。小人是从 `character/Q.png` 裁出的透明底 PNG（`video/public/character/`，裁图脚本 `character/crop_q.py`），按原尺寸、最近邻插值显示；暂时没有动效。
- 字幕只在显示时去掉分句标点 `，。、；`：句中的换成一个空格，句末（和句首）的直接去掉，紧挨在右引号、右书名号、右括号前的也直接去掉（`他说：“好的。”` 显示为 `他说：“好的”`）；`：“”‘’《》（）——？！` 保留（`video/src/shell/subtitle-text.ts`）。旁白脚本、配音、语音识别核对、合成清单和缺字检查都用原句。
- 中间帧格式是 PNG（`video/remotion.config.ts`），JPEG 会让像素边缘出现杂色。

## 检查

先运行过 `make install`，再运行：

```sh
make check
```

依次运行 pytest、ruff（lint + 格式）、`tsc`、ESLint、Vitest，任何一项失败就以非零码退出。"做完了"的标准就是这条命令通过。

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
