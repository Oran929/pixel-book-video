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

- [ ] 选一款中文像素字体，许可允许商用；字体文件放在 `video/public/fonts/`，许可文件和来源一起提交
- [ ] 风格表里的字号常量都是字体设计尺寸的整数倍，TS 测试检查这一点
- [ ] 自动检查：合成清单里所有字幕文本用到的字符，在字体里都有字形（例如用 fontTools 读字体的字符表）；缺字时报错，指出是哪个旁白句的哪个字。这项检查放进配音流水线的检查报告，以后每期都会用到
- [ ] 中间帧格式改成 `png`
- [ ] 渲染出的 MP4 中字体清晰，没有因缩放产生的模糊（像素对齐）；第一帧就使用像素字体
- [ ] 风格样张页面只在 Studio 里出现，不进入成片
- [ ] 字幕框和组件里没有写死的颜色值或尺寸值，全部引用风格表
- [ ] 频道名和小人初版出现在样片里
- [ ] 人工验收：风格样张的观感、字体效果（包括彩色描边边缘）、频道形象初版

## Comments

- 来自 03（2026-10-28）：字幕框的颜色、边框、字号现在直接写在 `video/src/episode/Episode.tsx` 里（米白 `#f4ecd8`、深色 `#2b2b3a`、64px 系统字体），09 要换成风格表常量和像素字体。
- 来自 03 人工验收（2026-10-28）：用户觉得字幕偏大，已从 64 临时改成 48。定字号时以此为参考，并满足"像素字体设计尺寸的整数倍"。
- 来自 07（2026-10-28）：配音流水线的检查报告已经有了：`voice_episode` 每次运行都重写期目录里的 `report.json`（被 git 忽略），现在只有 `{"asr_failures": [...]}` 一个键。缺字检查可以加一个并列的键（如 `missing_glyphs: [{id, char}]`），`cli.py` 的 `voice` 分支里 `_print_asr_failures` 旁边再打印它。注意 Python 一侧要能找到字体文件（`video/public/fonts/`），`voice_episode` 现在不知道字体在哪，需要加参数或从 `public_dir` 推出。
- 来自 08（2026-10-28）：要换成风格表常量的写死值在 `video/src/components/PixelBlock.tsx`（方块 320px、描边 16px、阴影偏移 16px、字号 96、颜色 `#e07a3f` / `#2b2b3a` / `#f4ecd8`、`fontWeight: bold`）和 `video/src/episode/Episode.tsx`（字幕框，以及出现动画的 `ENTER_SECONDS = 0.4`、`SLIDE_DISTANCE = 160`）。位移距离和组件尺寸也应是像素网格的整数倍，否则落下过程中会出现非整像素位置。新组件要在 `video/src/components/registry.ts` 登记（参数的 zod schema + 实现）。
- 来自 07（2026-10-28，复核改为两步）：`report.json` 现在是 `{"asr_failures": [...], "asr_pinyin_passes": [...]}` 两个键；`cli.py` 里打印报告的函数从 `_print_asr_failures` 改名为 `_print_asr_report`，缺字检查的打印放在它旁边。
- 来自 12（2026-10-28）：组件参数格式从 `PixelBlock.tsx` 挪到了 `video/src/components/schemas.ts`（`PixelBlockProps`、`COMPONENT_PROPS`、`COMPONENT_SCHEMAS`），`registry.ts` 只登记实现。原因是时间轴导出命令在 Node 里校验分镜，不能加载 .tsx 和 remotion。新组件要登记两处（类型检查会提示缺哪处）；`schemas.ts` 里不要 import 风格表以外会拉进 React/remotion 的东西——风格表常量如果放在纯 .ts 文件里就没问题。

