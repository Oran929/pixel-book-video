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
docs/reference/      每种文件的格式和检查规则，以及生成的组件目录 components/
docs/how-to/         不常用的操作，每篇一个
```

## 安装

需要 [uv](https://docs.astral.sh/uv/)、Node.js 和 ffmpeg（`brew install uv node ffmpeg`）。

```sh
make install
```

配乐的曲子文件不进 Git，新机器上 `make install` 之后照 `video/public/music/README.md` 补齐（见 `docs/reference/storyboard.md`「配乐」）。

`mlx-audio`（配音和语音识别复核）只在 macOS 上安装；在别的系统上 `make install` 不装它，`make check` 照常能跑，但配音和复核用不了。

配音要 Apple Silicon，模型第一次使用时自动下载（每个约 4 GB），也可以先手动下载，见 `docs/reference/voice.md`「配音模型」。

## 做一期

新书先 `/new-book`（书配置、原书、转换），然后 `/episode <期目录>` 一步步做到成片，停在三个人工关口等人审。一期做到哪一步、下一步做什么，看 `pixelbook status`：

```sh
cd tools
uv run pixelbook status ../books/<书>/chNN/epNN
uv run pixelbook render ../books/<书>/chNN/epNN/script.yaml   # 出片到期目录的 out/
```

## 参考文档

每种文件的格式和检查规则各写一份，放在 `docs/reference/`；skill 和报错引用的就是这几份：

- [原书转换](docs/reference/convert.md)：`pixelbook convert` 和 `chapters/chNN.md` 的格式
- [大纲](docs/reference/outline.md)：`outline.yaml`
- [旁白稿与检查](docs/reference/script.md)：`script.yaml` 和 `pixelbook check`
- [语义核对](docs/reference/factcheck.md)：`factcheck.yaml`
- [配音](docs/reference/voice.md)：配音模型、`pixelbook voice` 和配音缓存、书的音色与锁定、读音表与新术语、语音识别复核、缺字检查
- [分镜](docs/reference/storyboard.md)：`storyboard.json`，连同网格、字宽估算、嵌套、带序号的状态、显示文字、音效、配乐
- [组件目录](docs/reference/components/index.md)：分镜能用的组件，目录页每个组件一行，每个组件一页详情；由 `cd video && npm run catalog` 从组件声明生成，不手改
- [画面](docs/reference/video.md)：风格表、字体与频道形象，片头和片尾的登记规则，时间轴、打点时间表与试听音轨
- [出片](docs/reference/render.md)：`pixelbook render` 的四步、汇总和出了问题怎么办
- [进度判断](docs/reference/status.md)：`pixelbook status` 怎么只看文件判断一期的阶段、人工关口和下一步

## 操作

不常用的操作各写一篇短文，放在 `docs/how-to/`：

- [跑检查](docs/how-to/run-checks.md)：`make check`、`make smoke`、CI
- [在 Studio 里预览](docs/how-to/preview-in-studio.md)
- [发布一期](docs/how-to/publish.md)
- [换片头片尾](docs/how-to/change-bookend.md)
- [加一首配乐](docs/how-to/add-music.md)
- [加新音色](docs/how-to/add-voice.md)
- [某本书改用 yujie](docs/how-to/book-uses-yujie.md)
- [换语音识别模型](docs/how-to/change-asr-model.md)
- [重新生成 README 的 GIF](docs/how-to/regenerate-gif.md)
