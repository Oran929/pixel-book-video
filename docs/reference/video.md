# 画面

风格表、字体与频道形象，片头和片尾的登记规则，时间轴、打点时间表与试听音轨。

## 风格表、字体与频道形象

- 风格表在 `video/src/style/style.ts`：16 色调色板 `PALETTE` 和按用途取色的 `COLOR`、像素网格 `GRID`（4px，画面上一个"像素"）、字号 `FONT_SIZE` 与行高、尺寸 `SIZE`（都是网格的整数倍）、描边 `border`、硬阴影 `hardShadow`、描边字 `outlinedText`。组件（`src/components/`，包括子目录里的常驻组件）里的颜色和尺寸只能引用这些常量，`npm run test` 递归扫描这个目录，检查源码里有没有写死的颜色值和数字（0、1 除外）。
- 字体：Fusion Pixel 12px 比例宽度简体（OFL 1.1，来源和许可在 `video/public/fonts/`）。字形画在 12×12 格上，字号只能是 12 的整数倍（现在用 24 / 48 / 96），否则会模糊；测试检查这一点。字体由 `src/style/font.ts` 在第一帧之前加载。
- 画面左上角常驻这一期的主题：旁白稿顶层的 `title`（等于大纲里这一期的 `topic`），经合成清单 `episode.json` 的 `title` 传进成片，由常驻组件 `src/components/resident/EpisodeTitle.tsx` 显示（橙字深色描边）。代码里没有写死的频道名。
- 频道小人不常驻画面，是一个通用组件 `Mascot`（见 `docs/reference/components/Mascot.md`「小人 `Mascot`」）：分镜里需要"人物做什么"时才用。小人图不是对齐网格的像素画，只能按原尺寸、整数倍或 1/2 显示，最近邻插值；现在统一按 1/2（`MASCOT_SCALE`，#42）。
- 字幕只在显示时去掉分句标点 `，。、；`：句中的换成一个空格，句末（和句首）的直接去掉，紧挨在右引号、右书名号、右括号前的也直接去掉（`他说：“好的。”` 显示为 `他说：“好的”`）；`：“”‘’《》（）——？！` 保留（`video/src/components/resident/subtitle-text.ts`）。旁白脚本、配音、语音识别核对、合成清单和缺字检查都用原句。
- 中间帧格式是 PNG（`video/remotion.config.ts`），JPEG 会让像素边缘出现杂色。

## 片头和片尾

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
## 时间轴、打点时间表与试听音轨

停顿规则只在 TypeScript 的时间轴函数里（`video/src/episode/timeline.ts`）。想听逐句配音按停顿排好后的整体效果，先导出时间轴，再拼一条试听音轨（不是正式产物，渲染时 Remotion 仍逐句放音频）：

```sh
cd video
npm run timeline -- ../books/pragmatic-programmer/ch02/ep01        # 写出期目录 out/ 里的 timeline.json 和 segments.txt
cd ../tools
uv run pixelbook mix ../books/pragmatic-programmer/ch02/ep01/out/timeline.json   # 拼到同一目录的 pragmatic-programmer-ch02-ep01-mix.wav
```

- `npm run timeline` 读产物目录 `out/` 里的合成清单 `episode.json`，有分镜时也读期目录里的分镜（取它的停顿覆盖，分镜不合格就报错），用和 Remotion 渲染时同一个 `planEpisode` 算出 `out/timeline.json`（不提交）：帧率 `fps`、总帧数 `totalFrames`（片头 + 正文 + 片尾）、片头的帧数 `introFrames`（正文从这一帧开始）、片尾的帧数 `outroFrames`（最后这么多帧是片尾，见「片头和片尾」），每个旁白句（`lines`）、画面（`scenes`）、段（`segments`）的 `startFrame`（含）和 `endFrame`（不含）。旁白句的 `endFrame` 是音频结束、不含之后的停顿；正文到最后一句音频结束为止，最后一个画面和段到这里结束，之后是片尾。
- 同一个命令还在 `out/` 里写出打点时间表 `segments.txt`（不提交）：每段一行 `00:00 段标题`，时间是该段开始帧换算成秒后向下取整，不到 1 小时用 `mm:ss`，超过用 `h:mm:ss`，可以直接贴到视频平台的分段设置。第一行是 `00:00 片头`（平台的分段要从 00:00 开始），正文各段写真实的开始时间（片头之后）。片尾每期都一样，不列。用 `--out` 写到 `out/timeline.json` 以外时不写打点时间表，免得试听用的时间轴覆盖正式的。
- 配乐要署名（用了 CC-BY 的曲子）时，同一个命令还在 `out/` 里写出 `credits.txt`（不提交，一行，贴进视频简介），并打印一行；CC0 的不写（见 `docs/reference/storyboard.md`「配乐」）。
- 命令最后打印总时长（`m:ss`，含停顿，向下取整到秒）和 4:00–6:00 的判断（在范围内 / 太短 / 太长，两端都算在范围内，按显示的整秒判断）；判断也写进 `timeline.json` 的 `duration` 字段（`seconds`、`text`、`verdict`：`within` / `too-short` / `too-long`，`verdictText`：判断的说明文字，`pixelbook render` 的汇总原样打印它；`intro`、`body`、`outro`：片头、正文和片尾各自的 `seconds`、`text`，不用片头时 `intro` 是 `null`，不用片尾时 `outro` 是 `null`；正文从片头结束到片尾开始）。判断按含片头和片尾的总时长；命令和 `pixelbook render` 的汇总在总时长后面写「（片头 m:ss，正文 m:ss，片尾 m:ss）」。样片阶段只报告，不以非零码退出。
- 只想听默认停顿、不要分镜里的覆盖时，加 `--no-storyboard`，再用 `--out` 写到别处，免得覆盖 `out/timeline.json`：`npm run timeline -- ../books/pragmatic-programmer/ch02/ep01 --no-storyboard --out ../books/pragmatic-programmer/ch02/ep01/out/default-pauses.timeline.json`，然后 `uv run pixelbook mix ../books/pragmatic-programmer/ch02/ep01/out/default-pauses.timeline.json`（默认写到同一目录的 `pragmatic-programmer-ch02-ep01-mix.wav`）。
- 试听音轨只有旁白，不含片头片尾的音轨和音效（只在 Remotion 渲染时放）；时间轴里正文从片头之后开始，所以试听音轨开头有片头长度（约 14 秒）的静音，结尾有片尾长度（10.8 秒）的静音。
- `pixelbook mix` 只读 `timeline.json`，不知道停顿是多少秒：每句的 wav（`audio`，以 `video/public/` 为起点）从"开始帧 ÷ 帧率"秒处开始，其余是静音，补到时间轴的总时长。拼完测量音轨，和时间轴总时长相差超过一帧就报错。`timeline.json` 格式不对时逐个写明字段位置。它用的是 `video/public/episode/` 里的 wav，所以要在 `pixelbook voice` 之后、对同一期导出时间轴；重新配音后要重新导出。
