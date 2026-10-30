# 跑检查

改完代码或文档，提交前跑 `make check`；改了配音流水线、时间轴或 Remotion 之后再跑一次 `make smoke`。合并 PR 前看 CI。

## `make check`

先运行过 `make install`，再运行：

```sh
make check
```

依次运行 pytest、ruff（lint + 格式）、`tsc`、ESLint、Vitest，任何一项失败就以非零码退出。"做完了"的标准就是这条命令通过。

pytest 里包括文档链接检查（`tools/src/pixelbook/doc_links.py`）：skill、README、`docs/` 里的相对链接，以及 skill、文档、源码注释里「文档路径「标题」」这样的引用（如 `docs/reference/storyboard.md`「音效」、`docs/reference/components/index.md`「组件目录」），目标文件或标题不存在时失败，报出文件和行号。引用标题时就照这个写法，检查才认得出。

能写成代码的检查和统计都放在 `pixelbook` 命令里（`units`、`outline`、`check`、`factcheck-prompt` 等），带测试；skill 只跑这些命令，做需要判断的事（写大纲、写稿、语义核对），不让智能体写一次性脚本自查。

## CI

GitHub Actions（`.github/workflows/check.yml`）在每个 PR 和推送到 main 时，在 Linux 上跑同一条 `make check`。私有仓库设不了「合并前必须通过」，合并 PR 前自己看一眼 Checks 是否全绿。

## 冒烟测试

冒烟测试单独一条命令（要真实渲染，慢一些，所以不在 `make check` 里）：

```sh
make smoke
```

它用 `tools/smoke/episode/` 里的固定小样例（4 句、带分镜和 `title`），把真实 TTS 和语音识别换成假引擎（静音 wav，不加载任何模型），在临时目录里经 `pixelbook render` 走完四步，再用 ffprobe 解码数出 MP4 视频流的帧数，和 `timeline.json` 的总帧数比，相差不超过一帧。样例的配乐是 48 kHz 的 Kalypo（曲子文件只在本机，缺了就在渲染一步报错并指向 `video/public/music/README.md`；旁白、音效是别的采样率，顺带验证混音时的重采样；正文比曲子短，只放一次），所以成片里的声音是片头片尾的音轨、配乐和音效（假旁白是静音）。它先查片头片尾（#50、#51）：时间轴的 `introFrames` 是 422、`outroFrames` 是 324，第一句从第 422 帧开始，最后一句（旁白稿的最后一句，配音不再追加片尾）在片尾开始那一帧结束，配乐的 `startFrame` 是 422、`endFrame` 是片尾开始那一帧，片头和片尾期间成片的逐帧电平和它们的音轨一样（响的帧相差不超过 1 dB，没有配乐叠上去），打点时间表从 `00:00 片头` 开始。再照排期把原曲从片头结束放到正文结束当参照（`music_reference`，和全长试验同一个），逐帧比 RMS（ffmpeg `astats`），检查分镜里的每个音效（样例用到了全部 7 个）在它的帧比配乐高出 3 dB 以上、第一个音效之前只有配乐；片头之后、淡出之前成片里没有参照之外的静音（`silencedetect`）；音频流和视频流一样长；三个不同的音效同时响起时峰值低于 -1 dBFS（只量正文，片头片尾的音轨本身约 -1 dBFS）。它验证的是渲染管线、时长和声音的时机，不是音质。配音缓存、锁定音色、Remotion 静态目录和 MP4 都在临时目录里，不碰 `books/`、`video/public/episode/` 和 `out/`。改了配音流水线、时间轴或 Remotion 之后跑一次。
