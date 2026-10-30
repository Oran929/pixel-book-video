# 像素风书籍讲解视频

把书的一章改编成约 5 分钟、像素风、配音与画面同步的讲解视频。

![ep01 片段：《程序员修炼之道》第 2 章，知识分到文档、规范、代码和测试](docs/media/ep01.gif)

## 安装

需要 [uv](https://docs.astral.sh/uv/)、Node.js 和 ffmpeg（`brew install uv node ffmpeg`）。配音要 macOS 和 Apple Silicon。

```sh
make install
```

配乐的曲子文件不进 Git，照 `video/public/music/README.md` 补到本机。配音模型第一次用时自动下载（每个约 4 GB），见 [配音模型](docs/reference/voice.md#配音模型)。

## 出一期片子

仓库里已经有 ep01 的旁白稿和分镜，装完直接出片：

```sh
cd tools
uv run pixelbook render ../books/pragmatic-programmer/ch02/ep01/script.yaml
```

成片写到 `books/pragmatic-programmer/ch02/ep01/out/pragmatic-programmer-ch02-ep01.mp4`。做新的一期：新书先 `/new-book`，然后 `/episode <期目录>` 一步步做到成片；做到哪一步看 `uv run pixelbook status <期目录>`。

## 仓库结构

所有书共用的在 `video/`、`voices/`、`tools/` 和根目录的几份配置里；一本书独有的都在 `books/<书>/` 下。

```
books/<书>/          一本书独有的：书配置、原书和转换出的章（不提交）、锁定音色、配音缓存；书 → 章（大纲）→ 期，成片在期目录的 out/
video/               共用：Remotion 项目（npm 管理），组件、片头片尾、音效、配乐；合成清单 + 分镜 → MP4
voices/              共用：音色试听方案（audition.yaml，候选 tianmei、yujie）、参考音频、备用音色配置
tools/               共用：Python 工具 pixelbook（uv 管理），转换、检查、配音、出片
docs/                参考文档 reference/（每种文件的格式和检查规则）、操作 how-to/、决策 adr/、agent 约定 agents/、README 的 GIF media/；术语在根目录 GLOSSARY.md
voice.yaml           项目默认音色
pronunciation.yaml   读音表（全频道共用）
verification.yaml    语音识别复核的配置
```

## 流程各阶段 → 文档

| 阶段 | skill | 文档 |
| --- | --- | --- |
| 转换 | [/new-book](.claude/skills/new-book/SKILL.md) | [原书转换](docs/reference/convert.md) |
| 大纲 | [/outline](.claude/skills/outline/SKILL.md) | [大纲](docs/reference/outline.md) |
| 旁白稿 | [/script](.claude/skills/script/SKILL.md) | [旁白稿与检查](docs/reference/script.md) |
| 语义核对 | [/factcheck](.claude/skills/factcheck/SKILL.md) | [语义核对](docs/reference/factcheck.md) |
| 新术语 | — | [读音表与新术语](docs/reference/voice.md#读音表与新术语) |
| 分镜与组件目录 | [/storyboard](.claude/skills/storyboard/SKILL.md) | [分镜](docs/reference/storyboard.md)、[组件目录](docs/reference/components/index.md) |
| 配音 | — | [配音](docs/reference/voice.md) |
| 渲染 | [/episode](.claude/skills/episode/SKILL.md) | [出片](docs/reference/render.md)、[进度判断](docs/reference/status.md) |
| 片头片尾 | — | [片头和片尾](docs/reference/video.md#片头和片尾)、[换片头片尾](docs/how-to/change-bookend.md) |

其他不常用的操作（跑检查、在 Studio 里预览、发布、加配乐、加音色等）各一篇，在 [docs/how-to/](docs/how-to/)。
