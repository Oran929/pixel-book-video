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
docs/reference/      每种文件的格式和检查规则（大纲、旁白稿、语义核对、分镜），以及生成的组件目录 components/
```

## 安装

需要 [uv](https://docs.astral.sh/uv/)、Node.js 和 ffmpeg（`brew install uv node ffmpeg`）。

```sh
make install
```

配乐的曲子文件不进 Git，新机器上 `make install` 之后照 `video/public/music/README.md` 补齐（见 `docs/reference/storyboard.md`「配乐」）。

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
uv run pixelbook audition             # 按 voices/audition.yaml 生成试听音频到 voices/audition/
uv run pixelbook choose-voice <名字>  # 把选中的音色写进 voice.yaml
```

`audition` 会为每个候选音色生成 `<名字>-<句号>.wav`，并打印每句的生成耗时、音频时长、峰值内存，以及一期（约 100 句）的耗时估算，完整数据在 `voices/audition/report.json`（不提交）。设计音色另外生成一句 `<名字>-ref.wav`：如果选中的是设计音色，`choose-voice` 会把这一句复制到 `voices/<名字>.wav` 作为参考音频，`voice.yaml` 改用 Base 模型克隆它。所以选之前也要听一下这句参考句。选中预设音色时，`voice.yaml` 直接记录模型和音色名。`voice.yaml` 里的 `ref_audio` 是相对仓库根目录的路径；`voice.yaml` 和参考音频都要提交。

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

## 参考文档

每种文件的格式和检查规则各写一份，放在 `docs/reference/`；skill 和报错引用的就是这几份：

- [大纲](docs/reference/outline.md)：`outline.yaml`
- [旁白稿与检查](docs/reference/script.md)：`script.yaml` 和 `pixelbook check`
- [语义核对](docs/reference/factcheck.md)：`factcheck.yaml`
- [分镜](docs/reference/storyboard.md)：`storyboard.json`，连同网格、字宽估算、嵌套、带序号的状态、显示文字、音效、配乐
- [组件目录](docs/reference/components/index.md)：分镜能用的组件，目录页每个组件一行，每个组件一页详情；由 `cd video && npm run catalog` 从组件声明生成，不手改

## 从旁白稿到 MP4

### 完整步骤

一期从原书到成片的制作清单，下一期照着做（spec #16 用户故事 65）。`<书>` 是 `books/` 下的书目录名，`<期目录>` 是 `books/<书>/chNN/epNN`；下面的命令都从仓库根目录出发。每个人工关口都是停下等用户审，用户说通过才提交、才往下走。

| 步 | 做什么 | 写出什么（期目录以外的写明位置） | 提交 |
| --- | --- | --- | --- |
| 0 | 一本书做一次：书配置、原书、转换 | `books/<书>/book.yaml`、`source.epub`、`chapters/chNN.md` | 只提交 `book.yaml` |
| 1 | `/outline <书> <章>` | `books/<书>/chNN/outline.yaml` | 关口 1 通过后 |
| 2 | 人工关口 1：审大纲 | — | — |
| 3 | `/script <期目录>`（含 `/factcheck`） | `script.yaml`（`status: draft`）、`factcheck.yaml` | 关口 2 定稿后 |
| 4 | 人工关口 2：审稿、定稿 | `script.yaml` 改成 `final`，大纲里这一期的 `minutes` 改成估算 | 旁白稿、`factcheck.yaml`、大纲一起 |
| 5 | `pixelbook render` 出字幕版试听 | 期目录 `out/` 里的 `episode.json`、`report.json`、`timeline.json`、`segments.txt`、`<书>-<章>-<期>.mp4` | 都不提交 |
| 6 | `/storyboard <期目录>` | `storyboard.json`（含 `music`）、用了 CC-BY 曲子时 `out/credits.txt`；重新出的 MP4 | 关口 3 通过后提交分镜 |
| 7 | 人工关口 3：看成片 | — | — |
| 8 | 发布前准备 | 标题、简介、分段设置 | — |

**0. 一本书做一次**

- 做什么：写书配置 `books/<书>/book.yaml`（书名、作者、出版社，可选音色覆盖，见「书的音色与锁定」）；把原书放成 `books/<书>/source.epub`；转换：`cd tools && uv run pixelbook convert ../books/<书>`（见「原书转换」）。
- 本机准备（换机器时也要做一次）：`make install`；音色已选好（`voice.yaml`，见「配音模型」）；**配乐文件在本机**：`video/public/music/` 里有登记表的 8 个 `.ogg`，缺了照 `video/public/music/README.md` 补齐（曲子不进 Git，见 `docs/reference/storyboard.md`「配乐」）。
- 完成：`books/<书>/chapters/` 里有每章的 `chNN.md`；`ls video/public/music/*.ogg` 列出 8 首。
- 出了问题：`convert` 报规则覆盖不到的元素时，先在 `tools/src/pixelbook/convert.py` 里补规则再转，不要手改转换结果。

**1. 大纲 `/outline <书> <章>`**

- 输入：`chapters/chNN.md` 和 `pixelbook units` 的单元表。输出：`books/<书>/chNN/outline.yaml`，覆盖整章，拆成几期、每期的主题、段和带出处的观点（格式见 `docs/reference/outline.md`「大纲」）。
- 完成：`cd tools && uv run pixelbook outline ../books/<书>/chNN/outline.yaml` 退出码 0，照搬警告都看过；skill 停在关口 1。
- 出了问题：转换结果不存在回到第 0 步。

**2. 人工关口 1：审大纲**

- 用户看 `/outline` 的汇报（拆期理由、每期的段和分钟数、要拍板的取舍）。有意见就让 `/outline` 改；意见是规则问题时先改 skill。
- 完成：用户说通过，提交 `outline.yaml`。一章的大纲审一次，之后各期都从第 3 步开始。

**3. 旁白稿 `/script <期目录>`（含 `/factcheck`）**

- 输入：审过的大纲里这一期的段和观点、它们引用的原文段落。输出：`<期目录>/script.yaml`（`status: draft`）、`/factcheck` 写出的 `<期目录>/factcheck.yaml`，以及给不支持、部分支持的句子写好的建议改法（临时副本里，不改正式稿）。格式和机械规则见 `docs/reference/script.md`「旁白稿与检查」和 `docs/reference/factcheck.md`「语义核对」。
- 完成：`cd tools && uv run pixelbook check ../<期目录>/script.yaml` 退出码 0；`factcheck.yaml` 写出、每句都有判定；skill 停在关口 2。
- 出了问题：大纲里没有这一期，或大纲检查不过，回到第 1 步（大纲要先过关口 1）。

**4. 人工关口 2：审稿、定稿**

- 用户看 `/script` 的汇报（置顶是不支持的句子），逐句决定改法。改了正式稿之后跑 `check`，再 `/factcheck <期目录>`（用户授权的改动记录时加 `--user-edited`），回到这一步。
- 定稿：`cd tools && uv run pixelbook sync-minutes ../<期目录>/script.yaml`（把各段估算写回大纲的 `minutes`），`script.yaml` 改成 `status: final`，再跑 `pixelbook check` 和 `pixelbook outline`，都通过。
- 完成：`script.yaml`、`factcheck.yaml`、`outline.yaml` 一起提交。
- 出了问题：要改大纲的拆期或观点时回到第 1 步，改完重新过关口 1。

**5. 字幕版试听 `pixelbook render`**

- 命令：`cd tools && uv run pixelbook render ../<期目录>/script.yaml`（还没有 `storyboard.json`，所以只有字幕、主题和片头片尾，没有组件和配乐；做什么见下面的「一键出片」）。
- 输出：期目录的产物目录 `out/` 里的合成清单 `episode.json`、检查报告 `report.json`、`timeline.json`、打点时间表 `segments.txt`（第一行 `00:00 片头`）和 MP4 `<书>-<章>-<期>.mp4`；每句配音缓存在 `books/<书>/cache/tts/`。
- 完成：退出码 0；汇总里的总时长（片头、正文、片尾）在 4:00–6:00 之内；复核未通过的句子都试听过，没有读错。
- 出了问题：新术语先 `pixelbook terms` 试听、登记读音表（见「读音表与新术语」）再跑；句子读错了删掉这句的缓存重跑，或者改读音表、给句子写 `speech`；改了旁白稿（包括 `speech`）就回到第 4 步重新核对、定稿；总时长超出范围回到第 4 步改稿。

**6. 分镜 `/storyboard <期目录>`**

- 先确认配乐文件在本机（第 0 步），缺了第 5 步的渲染会报错并指向 `video/public/music/README.md`。
- 输入：定稿的 `script.yaml` 里的画面说明和旁白句，`docs/reference/storyboard.md`「分镜」和组件目录 `docs/reference/components/index.md`「组件目录」（目录页挑组件，再读选中组件的详情页）。skill 先配音写出 `episode.json`（命中缓存），跑选曲命令 `cd video && npm run music:pick -- ../<期目录>`（把 `music` 写进 `storyboard.json`，之后不再改），再写分镜，跑 `npm run timeline -- ../<期目录>` 直到通过，最后 `pixelbook render` 出片、看样帧。
- 输出：`<期目录>/storyboard.json`（每个画面至少一个组件）；重新写出的 `<期目录>/out/` 里的 `timeline.json`、`segments.txt`、`<书>-<章>-<期>.mp4`；用了 CC-BY 曲子时 `<期目录>/out/credits.txt`（CC0 曲子没有）；交给用户的「表现不了」清单。
- 完成：`npm run timeline` 和 `render` 退出码 0；每个画面的样帧看过，没有遮挡和穿过；skill 停在关口 3。
- 出了问题：`script.yaml` 不是 `final` 或检查不过，回到第 4 步；分镜检查不过，skill 自己改分镜；画面说明要的东西现有组件表现不了，列进清单交给用户（加组件是另开的票）。

**7. 人工关口 3：看成片**

- 用户看 MP4、「表现不了」清单、配乐（曲子、许可、避开了哪一期的哪首）和每个画面用的组件。意见只改分镜（或用户同意的组件改动），改完 `/storyboard` 从它的第 5 步重跑；音量在 `video/src/style/volume.ts` 的 `VOLUME_DB` 调。
- 完成：用户说通过，提交 `storyboard.json`。
- 出了问题：要改旁白（句子、画面说明）时回到第 4 步，定稿后再从第 6 步跑。

**8. 发布前准备**

- 成片：`<期目录>/out/<书>-<章>-<期>.mp4`（第 7 步通过的那一版）。
- 简介：写明原书的书名、作者、出版社，照 `books/<书>/book.yaml` 抄。`<期目录>/out/` 里有 `credits.txt`（用了 CC-BY 配乐）时，把它那一行原样贴进简介；没有就不用贴。
- 分段：`<期目录>/out/segments.txt` 原样贴到视频平台的分段设置（第一行是 `00:00 片头`，片尾不列）。
- 完成：MP4、简介、分段三样都在手里。

#### 一键出片 `pixelbook render`

```sh
cd tools
uv run pixelbook render ../<期目录>/script.yaml   # 默认写到 <期目录>/out/<书>-<章>-<期>.mp4
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
npm run render -- ../<期目录>/out/<书>-<章>-<期>.mp4   # 渲染 MP4
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
- **用户的作品，不按组件规则改**：动画是用户定稿的，搬进来时只为 `make check` 的类型检查加了非空断言 `!`（`noUncheckedIndexedAccess`），配色、尺寸、时间点都没动。它们不在 `video/src/components/` 里，不受「组件只引用风格表」「组件不写死显示文字」两项检查约束（这两项只扫 `video/src/components/`）；也不是分镜组件：不占网格、没有状态，不进组件目录。
- **进时间轴**：`planEpisode` 把选中的片头的帧数记为时间轴的 `introFrames`，正文第一句从这一帧开始，组件的触发帧、音效帧整体后移；正文到最后一句音频结束为止（不加停顿），片尾紧接着开始，占最后 `outroFrames` 帧；最后一个画面和段到片尾开始为止。`totalFrames` = 片头 + 正文 + 片尾，帧数核对和总时长判断都按选中的那一个的帧数算，不写死。
- **画面和声音**：片头、片尾期间不显示字幕和主题（`showsResidents`），盖在正片画面上面。它们自带的音轨原样放（`VOLUME.intro`、`VOLUME.outro`，都是 0 dB）。配乐从片头结束放到正文结束，在**正文**最后 2 秒淡出，不覆盖片头和片尾（见 `docs/reference/storyboard.md`「配乐」）。
- **预览和对比**：Studio 里每个登记的片头片尾有一个合成 `Intro-<ID>`、`Outro-<ID>`，单独放它（带音轨）；`npx remotion render Outro-bye-bye out/outro.mp4` 渲染出来可以和用户的参考成片比（#50、#51 的评论里有 PSNR/SSIM 结果）。
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
uv run pixelbook terms ../books/sample/ch01/ep01/script.yaml   # 每个新术语一段试听音频，在期目录的 out/terms/
```

听完把读法写进 `pronunciation.yaml`。读法没问题的也要登记成原样不变的条目（如 `DRY: DRY`），表示"已确认"。

### 时间轴、打点时间表与试听音轨

停顿规则只在 TypeScript 的时间轴函数里（`video/src/episode/timeline.ts`）。想听逐句配音按停顿排好后的整体效果，先导出时间轴，再拼一条试听音轨（不是正式产物，渲染时 Remotion 仍逐句放音频）：

```sh
cd video
npm run timeline -- ../books/sample/ch01/ep01        # 写出期目录 out/ 里的 timeline.json 和 segments.txt
cd ../tools
uv run pixelbook mix ../books/sample/ch01/ep01/out/timeline.json   # 拼到同一目录的 sample-ch01-ep01-mix.wav
```

- `npm run timeline` 读产物目录 `out/` 里的合成清单 `episode.json`，有分镜时也读期目录里的分镜（取它的停顿覆盖，分镜不合格就报错），用和 Remotion 渲染时同一个 `planEpisode` 算出 `out/timeline.json`（不提交）：帧率 `fps`、总帧数 `totalFrames`（片头 + 正文 + 片尾）、片头的帧数 `introFrames`（正文从这一帧开始）、片尾的帧数 `outroFrames`（最后这么多帧是片尾，见「片头和片尾」），每个旁白句（`lines`）、画面（`scenes`）、段（`segments`）的 `startFrame`（含）和 `endFrame`（不含）。旁白句的 `endFrame` 是音频结束、不含之后的停顿；正文到最后一句音频结束为止，最后一个画面和段到这里结束，之后是片尾。
- 同一个命令还在 `out/` 里写出打点时间表 `segments.txt`（不提交）：每段一行 `00:00 段标题`，时间是该段开始帧换算成秒后向下取整，不到 1 小时用 `mm:ss`，超过用 `h:mm:ss`，可以直接贴到视频平台的分段设置。第一行是 `00:00 片头`（平台的分段要从 00:00 开始），正文各段写真实的开始时间（片头之后）。片尾每期都一样，不列。用 `--out` 写到 `out/timeline.json` 以外时不写打点时间表，免得试听用的时间轴覆盖正式的。
- 配乐要署名（用了 CC-BY 的曲子）时，同一个命令还在 `out/` 里写出 `credits.txt`（不提交，一行，贴进视频简介），并打印一行；CC0 的不写（见 `docs/reference/storyboard.md`「配乐」）。
- 命令最后打印总时长（`m:ss`，含停顿，向下取整到秒）和 4:00–6:00 的判断（在范围内 / 太短 / 太长，两端都算在范围内，按显示的整秒判断）；判断也写进 `timeline.json` 的 `duration` 字段（`seconds`、`text`、`verdict`：`within` / `too-short` / `too-long`，`verdictText`：判断的说明文字，`pixelbook render` 的汇总原样打印它；`intro`、`body`、`outro`：片头、正文和片尾各自的 `seconds`、`text`，不用片头时 `intro` 是 `null`，不用片尾时 `outro` 是 `null`；正文从片头结束到片尾开始）。判断按含片头和片尾的总时长；命令和 `pixelbook render` 的汇总在总时长后面写「（片头 m:ss，正文 m:ss，片尾 m:ss）」。样片阶段只报告，不以非零码退出。
- 只想听默认停顿、不要分镜里的覆盖时，加 `--no-storyboard`，再用 `--out` 写到别处，免得覆盖 `out/timeline.json`：`npm run timeline -- ../books/sample/ch01/ep01 --no-storyboard --out ../books/sample/ch01/ep01/out/default-pauses.timeline.json`，然后 `uv run pixelbook mix ../books/sample/ch01/ep01/out/default-pauses.timeline.json`（默认写到同一目录的 `sample-ch01-ep01-mix.wav`）。
- 试听音轨只有旁白，不含片头片尾的音轨和音效（只在 Remotion 渲染时放）；时间轴里正文从片头之后开始，所以试听音轨开头有片头长度（约 14 秒）的静音，结尾有片尾长度（10.8 秒）的静音。
- `pixelbook mix` 只读 `timeline.json`，不知道停顿是多少秒：每句的 wav（`audio`，以 `video/public/` 为起点）从"开始帧 ÷ 帧率"秒处开始，其余是静音，补到时间轴的总时长。拼完测量音轨，和时间轴总时长相差超过一帧就报错。`timeline.json` 格式不对时逐个写明字段位置。它用的是 `video/public/episode/` 里的 wav，所以要在 `pixelbook voice` 之后、对同一期导出时间轴；重新配音后要重新导出。

## 风格表、字体与频道形象

- 风格表在 `video/src/style/style.ts`：16 色调色板 `PALETTE` 和按用途取色的 `COLOR`、像素网格 `GRID`（4px，画面上一个"像素"）、字号 `FONT_SIZE` 与行高、尺寸 `SIZE`（都是网格的整数倍）、描边 `border`、硬阴影 `hardShadow`、描边字 `outlinedText`。组件（`src/components/`，包括子目录里的常驻组件）里的颜色和尺寸只能引用这些常量，`npm run test` 递归扫描这个目录，检查源码里有没有写死的颜色值和数字（0、1 除外）。
- 字体：Fusion Pixel 12px 比例宽度简体（OFL 1.1，来源和许可在 `video/public/fonts/`）。字形画在 12×12 格上，字号只能是 12 的整数倍（现在用 24 / 48 / 96），否则会模糊；测试检查这一点。字体由 `src/style/font.ts` 在第一帧之前加载。
- 画面左上角常驻这一期的主题：旁白稿顶层的 `title`（等于大纲里这一期的 `topic`），经合成清单 `episode.json` 的 `title` 传进成片，由常驻组件 `src/components/resident/EpisodeTitle.tsx` 显示（橙字深色描边）。代码里没有写死的频道名。
- 频道小人不常驻画面，是一个通用组件 `Mascot`（见 `docs/reference/components/Mascot.md`「小人 `Mascot`」）：分镜里需要"人物做什么"时才用。小人图不是对齐网格的像素画，只能按原尺寸、整数倍或 1/2 显示，最近邻插值；现在统一按 1/2（`MASCOT_SCALE`，#42）。
- 字幕只在显示时去掉分句标点 `，。、；`：句中的换成一个空格，句末（和句首）的直接去掉，紧挨在右引号、右书名号、右括号前的也直接去掉（`他说：“好的。”` 显示为 `他说：“好的”`）；`：“”‘’《》（）——？！` 保留（`video/src/components/resident/subtitle-text.ts`）。旁白脚本、配音、语音识别核对、合成清单和缺字检查都用原句。
- 中间帧格式是 PNG（`video/remotion.config.ts`），JPEG 会让像素边缘出现杂色。

## 检查

先运行过 `make install`，再运行：

```sh
make check
```

依次运行 pytest、ruff（lint + 格式）、`tsc`、ESLint、Vitest，任何一项失败就以非零码退出。"做完了"的标准就是这条命令通过。

pytest 里包括文档链接检查（`tools/src/pixelbook/doc_links.py`）：skill、README、`docs/` 里的相对链接，以及 skill、文档、源码注释里「文档路径「标题」」这样的引用（如 `docs/reference/storyboard.md`「音效」、`docs/reference/components/index.md`「组件目录」），目标文件或标题不存在时失败，报出文件和行号。引用标题时就照这个写法，检查才认得出。

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

在 Studio 里打开 `Episode` 合成。`Intro-<ID>`、`Outro-<ID>` 合成单独放登记的每个片头片尾（见「片头和片尾」）。`StyleSheet` 合成是风格样张（调色板、用途色、字体、描边和阴影、字幕框），`Sample-<组件名>` 是各组件的样张（见 `docs/reference/storyboard.md`「分镜」），都只在 Studio 里看，渲染命令只渲染 `Episode`；要导出成图片：`npx remotion still StyleSheet out/style-sheet.png`。
