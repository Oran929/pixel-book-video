# 出片 `pixelbook render`

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

## 出了问题

`pixelbook terms`、`voice`、`render` 非零退出或汇总里有问题时：

- **新术语**：先 `pixelbook terms` 试听、登记读音表再跑（见 `docs/reference/voice.md`「读音表与新术语」）。
- **音色和锁定不一致**：停下交给用户；只有用户确认整本书换音色才加 `--revoice`（见 `docs/reference/voice.md`「书的音色与锁定」）。
- **缺字**：改写那句字幕、画面说明或主题，改了旁白稿就回到定稿那一步（见 `docs/reference/voice.md`「缺字检查」）。
- **复核未通过的句子**：试听；读错了就删掉这句的缓存重跑，或者改读音表、给句子写 `speech`；是识别错了就不用管（见 `docs/reference/voice.md`「语音识别复核」）。
- **改了旁白稿**（包括 `speech`）：回到关口 2 重新核对、定稿。
- **总时长不在 4:00–6:00**：回到关口 2 改稿。
- **分镜不合格**：改分镜，再跑 `npm run timeline` 直到通过。
- **配乐文件不在本机**：照 `video/public/music/README.md` 补齐（曲子不进 Git，见 `docs/reference/storyboard.md`「配乐」）。
- **转换结果不存在**：`pixelbook convert`（见 `docs/reference/convert.md`「原书转换」）；转换报规则覆盖不到的元素时先在 `tools/src/pixelbook/convert.py` 里补规则，不要手改转换结果。
