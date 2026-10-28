# 09: 风格表、中文像素字体、频道形象初试

**What to build:** 风格表写成代码常量：调色板（约 16 色）、像素网格大小、像素字体、描边和阴影规则。字幕框和样片组件只能使用这些常量。Remotion Studio 里有一个"风格样张"页面，集中展示调色板、字体（中英文、数字、标点）和描边。用我提供的频道名和小人形象做一个初版（可以是占位），放进样片。

**Blocked by:** 03

**Type:** HITL（开始时我提供频道名和形象想法；最后我验收观感）

**Status:** ready-for-agent

**像素清晰的条件（2026-10-28 审查后补充）：**

- 像素字体只有在字号是它设计尺寸的整数倍时才不模糊（例如 12px 设计的字体，只能用 24、36、48px……）。字形的位置也要落在整像素上。
- 字体候选：Fusion Pixel、Ark Pixel（都是 12px 设计，标称 OFL 许可，以实际下载到的许可文件为准）。
- `video/remotion.config.ts` 现在把中间帧设成 `jpeg`，JPEG 压缩会让像素边缘出现杂色。改成 `png`。
- H.264 常用的 yuv420p 色度采样会让彩色像素的边缘发虚，验收时专门看一下彩色描边；如果明显，再考虑调整编码参数。
- 字体必须在渲染第一帧之前加载完成（用 Remotion 的字体加载方式，或者 `delayRender`），否则开头几帧会用系统字体。

**验收：**

- [x] 选一款中文像素字体，许可允许商用；字体文件放在 `video/public/fonts/`，许可文件和来源一起提交
- [x] 风格表里的字号常量都是字体设计尺寸的整数倍，TS 测试检查这一点
- [x] 自动检查：合成清单里所有字幕文本用到的字符，在字体里都有字形（例如用 fontTools 读字体的字符表）；缺字时报错，指出是哪个旁白句的哪个字。这项检查放进配音流水线的检查报告，以后每期都会用到
- [x] 中间帧格式改成 `png`
- [x] 渲染出的 MP4 中字体清晰，没有因缩放产生的模糊（像素对齐）；第一帧就使用像素字体
- [x] 风格样张页面只在 Studio 里出现，不进入成片
- [x] 字幕框和组件里没有写死的颜色值或尺寸值，全部引用风格表
- [x] 频道名和小人初版出现在样片里
- [ ] 人工验收：风格样张的观感、字体效果（包括彩色描边边缘）、频道形象初版

## Comments

- 来自 03（2026-10-28）：字幕框的颜色、边框、字号现在直接写在 `video/src/episode/Episode.tsx` 里（米白 `#f4ecd8`、深色 `#2b2b3a`、64px 系统字体），09 要换成风格表常量和像素字体。
- 来自 03 人工验收（2026-10-28）：用户觉得字幕偏大，已从 64 临时改成 48。定字号时以此为参考，并满足"像素字体设计尺寸的整数倍"。
- 来自 07（2026-10-28）：配音流水线的检查报告已经有了：`voice_episode` 每次运行都重写期目录里的 `report.json`（被 git 忽略），现在只有 `{"asr_failures": [...]}` 一个键。缺字检查可以加一个并列的键（如 `missing_glyphs: [{id, char}]`），`cli.py` 的 `voice` 分支里 `_print_asr_failures` 旁边再打印它。注意 Python 一侧要能找到字体文件（`video/public/fonts/`），`voice_episode` 现在不知道字体在哪，需要加参数或从 `public_dir` 推出。
- 来自 08（2026-10-28）：要换成风格表常量的写死值在 `video/src/components/PixelBlock.tsx`（方块 320px、描边 16px、阴影偏移 16px、字号 96、颜色 `#e07a3f` / `#2b2b3a` / `#f4ecd8`、`fontWeight: bold`）和 `video/src/episode/Episode.tsx`（字幕框，以及出现动画的 `ENTER_SECONDS = 0.4`、`SLIDE_DISTANCE = 160`）。位移距离和组件尺寸也应是像素网格的整数倍，否则落下过程中会出现非整像素位置。新组件要在 `video/src/components/registry.ts` 登记（参数的 zod schema + 实现）。
- 来自 07（2026-10-28，复核改为两步）：`report.json` 现在是 `{"asr_failures": [...], "asr_pinyin_passes": [...]}` 两个键；`cli.py` 里打印报告的函数从 `_print_asr_failures` 改名为 `_print_asr_report`，缺字检查的打印放在它旁边。
- 来自 12（2026-10-28）：组件参数格式从 `PixelBlock.tsx` 挪到了 `video/src/components/schemas.ts`（`PixelBlockProps`、`COMPONENT_PROPS`、`COMPONENT_SCHEMAS`），`registry.ts` 只登记实现。原因是时间轴导出命令在 Node 里校验分镜，不能加载 .tsx 和 remotion。新组件要登记两处（类型检查会提示缺哪处）；`schemas.ts` 里不要 import 风格表以外会拉进 React/remotion 的东西——风格表常量如果放在纯 .ts 文件里就没问题。

- 来自用户（2026-10-28，开工输入）：
  - 频道名：**读一本8bit像素书**
  - 形象：仓库根目录 `character/` 下两张设定图，`Q.png`（Q 版，米色底）和 `M.png`（成熟版，带背景的卡片），各 1672×941，每张并排四个角色（图上标注 ChatGPT / Claude / DeepSeek / Grok）。用户说可以挑一个，也可以轮换。
  - 编排者的初版建议（用户可改）：样片里用 Q 版第二个角色（橙发、捧书，最贴"读书"主题）当频道小人；四个 Q 版角色都裁成单独的透明底图片留着，轮换以后再做。成熟版适合以后做片头或封面卡片，这张票不用。
  - 注意：这两张是 AI 生成的"像素风"图，不是严格对齐网格的像素画，有抗锯齿和非整数缩放。初版可以当占位直接用（缩放时用最近邻插值，显示尺寸取整数倍）；以后如果要真正清晰的像素小人，需要重画或按网格重新量化。图上的产品名文字不要放进成片。

- 实现记录（2026-10-28，agent）：
  - 字体：Fusion Pixel 12px，比例宽度（proportional），简体字形（zh_hans），woff2 格式，GitHub Release 2026.10.25，未修改。许可以下载到的文件为准：主字体 OFL 1.1，合并进来的 Ark Pixel、Cubic 11（含 JF Dot M+H 12、M+ BITMAP FONTS 的自由许可）、Galmuri 也都是 OFL 1.1，允许商用、嵌入和随作品分发，不能单独出售字体文件。许可、来源、sha256 在 `video/public/fonts/`（`OFL.txt`、`LICENSES/`、`SOURCE.txt`）。下载需要网络，没有受阻。选比例宽度而不是等宽，是因为英文和数字在等宽里太稀；中文字宽两者相同。
  - 字号：24 / 48 / 96（×2、×4、×8）。字幕沿用 03 人工验收定的 48。行高 = 16 个字体像素（字体上伸 13、下伸 3），基线落在整像素上。像素网格 `GRID` = 4px，即字幕字号下字体的一个像素；所有尺寸常量都是它的整数倍（测试检查）。原来的字幕框、方块尺寸本来就是 4 的倍数，数值没变。
  - 字体平滑：`pixelText` 里设 `-webkit-font-smoothing: none`，渲染帧放大看字形边缘是干净的方块。
  - 第一帧：`src/style/font.ts` 在模块加载时 `delayRender`，`FontFace` 加载完放进 `document.fonts` 才放行，在 `Root.tsx` 引入一次。抽出的第 0 帧已经是像素字体。
  - "没有写死的值"的检查规则从严：`src/shell/` 和 `src/components/` 下每个 .tsx，去掉注释后，颜色值（`#rrggbb`、`rgb()`、`hsl()`）和 0、1 以外的数字都算写死（`src/style/hardcoded.ts`）。为此把字幕框挪到 `src/shell/Subtitle.tsx`、组件出现动画挪到 `src/components/Entering.tsx`；`Episode.tsx` 只剩数据读取和编排（里面的 HTTP 404 不受这条规则管）。出现动画的 0.4 秒挪进 `MOTION`，落下距离进 `SIZE`，位移每帧取整到像素网格。
  - 描边字：八个方向、一个字体像素宽的硬 `text-shadow` 拼成。第一版字距不变，中文笔画密，描边把相邻字粘成一片，所以描边字的字距加宽两个字体像素（`outlinedText`）。频道名用橙字深色描边。
  - 缺字检查：`tools/src/pixelbook/glyphs.py` 用 fontTools 读字体字符表（新增依赖 `fonttools[woff]`，读 woff2 要 brotli）。`voice_episode` 多了参数 `font`，CLI 传 `video/public/` + `pipeline.SUBTITLE_FONT`；不传就不检查，报告里也没有这一项（只为了让已有测试不必都带字体）。缺字时报告 `missing_glyphs: [{id, char}]`，同一句重复的字只报一次，空白不查；`voice` 打印旁白句、字和码位，**以退出码 1 结束**（"报错"），但合成清单和报告照常写出。字体文件不存在时配音前就报错。样例书 7 句没有缺字。分镜里组件的文字（如方块上的 `DRY`）不在检查范围内，票里只要求字幕文本。
  - 字体文件名在 TS（`style.ts` 的 `FONT.file`）和 Python（`pipeline.SUBTITLE_FONT`）各写一次，两边各有测试确认文件存在；换字体要改两处。
  - 风格样张：单独的合成 `StyleSheet`（1920×3600，一帧），Studio 里能看到；渲染命令是 `remotion render Episode`，只渲染成片。没有用 `isStudio` 把它藏起来，这样还能 `npx remotion still StyleSheet` 导出成图片给人看。
  - 频道形象：四个 Q 版角色用 `character/crop_q.py` 裁成透明底 PNG（`video/public/character/q-1-dragon.png`、`q-2-reader.png`、`q-3-whale.png`、`q-4-gothic.png`，按外观起名，不用产品名），产品名标签和脚下影子去掉了，原图留在 `character/`。脚本是一次性的，依赖用 `uv run --no-project --with pillow --with numpy --with scipy` 临时装，不进项目。按编排者建议，样片用橙发捧书的 `q-2-reader`：原尺寸（×1，374×560）、`image-rendering: pixelated`，站在左下角；频道名「读一本8bit像素书」在左上角。小人离左边 32px（比 64px 的边距小），免得和最长（20 字）的字幕框重叠。裁图边缘还留着原图的米色抗锯齿杂边，在米白底上看不出来，换深色底会露出来。
  - 彩色描边与 yuv420p：放大看渲染帧，橙色笔画和深色描边相接处有很轻的色度渗色（偏暗红的一圈），整体仍清晰。暂不改编码参数，留给人工验收判断。
  - 渲染：样片 565 帧，`out/sample-ch01-ep01.mp4`；抽帧和放大图在 `out/frames-09/`（第 0、30、203、260、486、540 帧，`zoom-*.png`），风格样张图在 `out/frames-09/style-sheet.png`。

- 来自用户（2026-10-28，看过初版后）：整体质感通过。两处修改：
  1. **小人不常驻**：从外壳里拿掉（样片画面里不再出现）。改成一个通用组件，在组件注册表里登记，只在分镜里需要"人物做什么"时才用。`character/` 原图和四张 Q 版裁图都保留。动效暂不做（评估过：基于现有图的上下跳动成本低但效果一般；逐帧动画要重画，成本高），以后真要用时再说。
  2. **字幕标点**：只改字幕显示，配音和语音识别核对仍用原句。去掉 `，。、；`，句中的去掉后换成一个空格，句末的直接去掉。保留 `：“”‘’《》（）——` 和 `？！`。

- 按用户意见修改（2026-10-28，agent）：
  - 小人：`src/shell/Mascot.tsx` 删掉，样片画面里不再有小人（频道名照旧在左上角）。新组件 `src/components/Mascot.tsx`，在 `schemas.ts`（`MascotProps`）和 `registry.ts` 两处登记。参数 `character`：`dragon` / `reader` / `whale` / `gothic`（取自风格表 `MASCOTS` 的键，按外观起名）；`position`：画面底部 `left` / `center` / `right`，左右离边缘 `SIZE.mascotInset`（原 `mascotLeft` 改名，仍是 32px）。两个参数都必填，没有缩放参数，按原尺寸、最近邻插值显示。风格表里的 `MASCOT`（样片用的那个）删了。组件文件在 `src/components/` 下，自动受"没有写死的值"检查。样片分镜不用它。风格样张里改成两个和成片同宽的画框，用组件本身展示四个角色和三个站位（画布高 3600 → 4000）。没做动效。
  - 字幕标点：纯函数 `src/shell/subtitle-text.ts` 的 `subtitleDisplayText`（有测试），只在字幕框 `Subtitle` 里调用，所以风格样张里的字幕框也一样去标点。旁白脚本、配音、语音识别核对、合成清单都不变。规则之外多定了一条：分句标点紧挨在 `”’》）` 前面时直接去掉、不换空格（`他说：“好的。”` → `他说：“好的”`），否则引号前会多一个空格。连续标点、标点旁原本就有空格时只留一个空格，句首的也去掉。空格是字体里的半角空格，在比例宽度字体里约半个汉字宽，样片里看得出断开。英文标点 `,.;` 不处理。
  - 缺字检查仍查原句（不改 Python）：去掉的四个标点字体里都有，原句的字是显示文字的超集，查原句不会漏报。
  - 验收项"频道名和小人初版出现在样片里"按用户意见已不成立（样片里只剩频道名），勾选状态没动，留给人工验收时一起看。
  - 渲染：`out/sample-ch01-ep01.mp4` 重新渲染；抽帧 `out/frames-09b/frame-000/203/360/440/520.png`（440 是"改了一处 另一处就会忘记改"，句中逗号换成空格），风格样张图 `out/frames-09b/style-sheet.png`（底部是小人组件）。
