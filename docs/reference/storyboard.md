# 分镜

每期可以有一份分镜 `books/<书>/<章>/<期>/storyboard.json`（提交到 git），写每个画面用哪些组件、在哪句旁白出现，不写绝对时间。旁白稿定稿后用 `/storyboard <期目录>` 写：它先跑选曲命令（见下面「配乐」里的选曲），按画面说明和 README「组件目录」写分镜，跑 `npm run timeline` 直到通过，再 `pixelbook render`，停在人工关口 3。`voice` 和 `stage` 把它复制到 `video/public/episode/`；没有分镜时照常渲染，只有字幕。

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
- `parent`（可选）：父组件的 id，表示有意嵌套（大方块里占一小角）；`from`、`to`：连线类组件的起点和终点。见下面的「嵌套」和 README「组件目录」里的「箭头」。
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
- **样张**：每个组件在 Studio 里有一页 `Sample-<组件名>`，用 `samples.ts` 里的假分镜（经同一个 `planEpisode` 排期）把它的每个状态、每种入场和退场动画、每个默认音效都演一遍，字幕位置写着这一刻在演什么，同时放出音效。`npm run test` 检查每个登记的组件都有样张、样张通过分镜检查、演到了每个状态和每种入场退场动画、放到了入场、退场和切到每个状态的默认音效。导出某一帧：`npx remotion still Sample-PixelBlock out/samples/pixelblock.png --frame=300`。7 个组件首尾相接的样片是合成 `ComponentSamples`（见「组件目录」）。
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

## 网格

组件摆在字幕框上方的 12 列 × 6 行粗网格里（`video/src/style/grid.ts` 的 `layoutGrid`，就放在风格表旁边）：

- **区域**：左右各扣掉安全边距 `SIZE.margin`；上沿是左上角主题的下沿（`SIZE.margin` + 字幕字号的行高），下沿是字幕框外描边的上沿（画面高 − `SIZE.margin` − 字幕框高 − 外描边 `SIZE.stroke`，字幕框高 = 2 × `SIZE.stroke` + 2 × `SIZE.subtitlePaddingY` + 字幕字号的行高；字幕最多 20 字，总是一行）。
- **每格**：区域宽 ÷ 12、区域高 ÷ 6，各自向下对齐到像素网格 `GRID`（4px）；余下的像素平均分到两侧（每侧也向下对齐到 4px）。
- 1920×1080 下：区域 x 64–1856、y 128–880，每格 **148 × 124** 像素，第 0 列从 x = 72 开始，第 0 行从 y = 132 开始。
- **越界**：`at` 加上组件占的格数超出 12 列或 6 行时报错（报出第几个画面、第几个组件、超出哪一边）。
- **重叠**：同一时间都在画面上的两个组件，格子有重叠就报错，报出两个组件、第一个重叠的格和同时在画面上的帧。「同时在画面上」按排期的帧区间算：从入场帧到退场动画播完（没有退场的到画面结束），所以先退场、后入场的两个组件，后一个要等前一个的退场动画播完（`fade`、`slide` 0.4 秒；`none` 不用等）才能占同一格。连线类组件不参加重叠检查；子组件和它的父组件（及更上层）不算重叠，和别的组件照常检查。

`video/src/episode/ep01-placement.test.ts` 用 ch02 ep01 的合成清单（`fixtures/ep01-episode.json`，去掉了音频路径）和一份占位分镜，把 17 个画面各摆了一遍，作为摆放的参考，7 个组件都用组件注册表里真实的声明：s01-c01 五个小人挤成一群（`crowd`），上面一排四个知识块；s02-c02 三个小人一排（`row`），旁白说「刻意问自己」时一起冒问号，下面一排三个知识块；s01-c03 三个方块各有一个箭头指向 ETC；s05-c04 的「复制粘贴源码」先单独出现，旁白说「只是很小的一部分」时用 `none` 瞬间换成大方块「知识和意图」左上角的子组件（子组件不能早于父组件入场）；s05-c05 代码在左，箭头指向右上的文档和右下的数据库 Schema；s02-c01 岔路标出第 2 条路，s03-c02 岔路放上路障又撤掉，s04-c04 时间线「起点、开发过程、发布」点亮到第 3 个。

## 字宽估算

组件上的字（知识块的标签、提示牌的标题、电脑屏幕上的字、岔路和时间线的标签）不换行、不加字距，放不下时报错，不会悄悄溢出或换行。每个组件能放多宽见 README「组件目录」里它的小节。宽度按像素字体估算（`video/src/style/text-width.ts` 的 `textWidth`）：

- 汉字、全角符号和弯引号（ASCII 以外的字）按 1 个字号宽；
- 拉丁字母、数字、空格和半角符号（U+0020–U+007E）按字体度量：`video/src/style/ascii-advances.json` 是从字体文件的 `hmtx` 表导出的每个字符的步进宽度（字体像素，乘以 字号 ÷ 12 就是屏幕像素），例如 `W` 10、`M` 8、`a` 6、`i` 4。`tools/tests/test_font_metrics.py` 核对这张表和字体文件一致；换字体时要重新导出。
- 不算字距。例：`数据库 Schema` 在字号 48 下是 3 × 48 + 6 × 4 + 39 × 4 = 324 像素。

## 嵌套

需要「大方块里占一小角」时（spec #16 用户故事 22），子组件写 `parent: <父组件 id>`，`at` 照常写网格上的绝对位置：

- 父组件必须是本画面里按格子摆放的组件，**写在子组件前面**（后写的画在上面，子组件才不会被父组件盖住），不能是自己。
- 子组件的格子必须完全落在父组件的格子里，区间也必须完全落在父组件的区间里（同一帧入场合法）；这时不算重叠。任一条不满足都报错。
- 子组件不能压住父组件的标签：组件声明里的 `labelArea(props)` 给出标签占的格（相对组件自己的左上角），子组件的格子和它有公共格就报错。不写 `labelArea` 的组件没有要让开的字。每个组件哪里能嵌子组件，见 README「组件目录」里它的小节。
- 例：`知识和意图`（`large`，`at: [4, 1]`）的左上角嵌一个 `复制粘贴源码`（`small`，`at: [4, 1]`，`parent: "intent"`）。

## 带序号的状态

「第 N 条路有路障」「点亮到第 N 个节点」用**每种情况单独声明一个状态**（`block-1` … `block-4`、`lit-1` … `lit-6`），不用带参数的状态名，分镜的 `state` 写法和别的组件一样。状态清单按参数的上限声明；声明里的 `availableStates(参数)` 给出这组参数下能用的状态，分镜检查据此拦下超出条数、节点数的序号（「按它的参数不能用状态 block-3，能用的状态：…」）；写了根本没声明的名字（如 `block-5`）照常报「没有状态」。组件实现从舞台信息的 `previousState` 知道是从哪个状态切过来的（撤掉哪条路上的路障、从哪个节点接着亮）。

## 显示文字

组件上显示的每一段字，都必须出自本画面的画面说明或旁白句，这样画面不会引入原文以外的说法（spec #16 修订 D4）。分镜检查（同一个 `planEpisode`）逐个核对：

- **哪些参数是显示文字**：组件声明的参数格式里用 `displayText(...)` 标出（`video/src/components/declaration.ts`，登记在 zod 4 的 registry `DISPLAY_TEXT` 里，不另写清单）。只能标字符串或字符串数组（数组逐项检查），只认参数对象的顶层字段（外面可以套 `.optional()`）；`npm run test` 检查组件注册表里每个显示文字参数都是字符串或字符串数组。现在有知识块的 `label`、提示牌的 `label`、`number`、`title` 和电脑的 `screen`。
- **比对口径**：两边先做 NFKC 规范化，再去掉 `，。、；` 和空白，然后看显示文字是不是**本画面的画面说明**或**本画面某个旁白句原句**（合成清单的 `text`，不是朗读文本）的子串。NFKC 会把全角的 `，`、`；` 变成半角，所以半角的 `,`、`;` 也一并去掉；`？`、`！`、引号、破折号照常比。每项单独和每一处出处比，不能跨两句拼接。
  - 例（ep01）：`s01-c03` 里「解耦」「单一职责」通过；`s05-c05` 里「数据库 Schema」和「数据库Schema」都通过；`s02-c02` 里「更容易改，还是更难改？」和「更容易改 还是更难改？」都通过；`s01-c02` 里「提示14」（画面说明「提示14 的标题牌亮起」）通过；`s05-c02` 里「DRY——不要重复自己」报错（旁白句是「DRY，就是不要重复自己。」）。
- 显示文字不能是空串，去掉标点和空白后是空串也报错。
- 报错写明第几个画面、第几个组件（id 和组件名）、哪个参数（数组还写第几项）、找不到的那段字，例如 `第 1 个画面 第 1 个组件 props label: 组件 k（PixelBlock）的显示文字「DRY——不要重复自己」不在画面 s05-c02 的画面说明和旁白句里`。
- **组件不渲染参数以外的固定文字**。比如电脑屏幕上的「ERROR」，也要作为显示文字参数传进去，并且写进画面说明或旁白句。`npm run test` 扫描组件目录里的 `.tsx`（`findFixedText`，`video/src/style/hardcoded.ts`），找出 JSX 里直接写的字（`<b>ERROR</b>`、`{"ERROR"}`）；藏在常量里再引用的字认不出来，靠代码审查。
- **强度有限**：这条检查只能挡住原文以外的词，挡不住拼凑。几项各自出自原文的字摆在一起，照样可能拼出原文没有的意思，这要靠审分镜时人看。

## 音效

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

## 配乐

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
- **全长试验**（#39，#52 改成交叉淡化）：`cd tools && uv run pixelbook music-trial ../books/<书>/<章>/<期>/script.yaml [--storyboard 试验分镜.json]` 先像 `pixelbook render` 一样出片到期目录的 `out/<书>-<章>-<期>.mp4`，再把 `EpisodeMusic` 渲染成同一目录的 `<书>-<章>-<期>-music.wav`，然后检查（`tools/src/pixelbook/music_check.py` 的 `check_music`）：
  - 音频流和视频流一样长（相差不超过一帧）；配乐声轨在 `startFrame` 之前（片头期间）和 `endFrame` 之后（片尾期间）每帧都低于 -50 dBFS。
  - **参照**：照 `timeline.json` 的 `plays` 把原曲放出来（`music_reference`，numpy 混音，音量公式和 `musicVolume` 一样，在 Python 里独立写一遍，取整同 Remotion），写成同一目录的 `<书>-<章>-<期>-music-reference.wav`，可以拿来对着听。每次循环像 Remotion 那样放在**整毫秒**上：Remotion 用 `adelay=<毫秒>` 摆放每份音频，第 f 帧放在 round(f / 30 × 1000) 毫秒，帧号除以 3 余 1 的早 1/3 毫秒、余 2 的晚 1/3 毫秒（48 kHz 下 16 个采样）。配乐声轨和参照逐帧比 RMS（`astats`），差取中位数；每帧的电平超出「前后一帧的参照电平加上整体的差」±1 dB 算问题（交叉淡化处掉音、爆音，淡出没做或做错）。前后一帧放宽，是因为 Remotion 的音量台阶按帧中点、按音频包切换，台阶边上的帧和参照对不齐。参照低于 -60 dBFS 的帧（曲子里的停顿、淡出的最后几帧）不比。淡出不再单独查「逐帧不回升」：它和交叉淡化一样折算进了参照。#39 的旧检查在 #50、#51 的试验里报的回升是测量误差：旧参照把每次循环放在整帧上，比 Remotion 早 16 个采样，音符起音碰到帧边界时逐帧的差会抖，淡出前段每帧只降约 0.15 dB，抖动就成了「回升」（见 #52 的评论）。
  - 每段交叉淡化前后 1 秒，声轨和成片里都没有参照之外的静音（`silencedetect`，低于 -50 dBFS、20 毫秒以上；曲子里本来就有的停顿参照里也有）。
  - 每段交叉淡化打印一行，有问题时以非零码退出。`--storyboard` 在出片期间临时换上这份分镜，结束后把期目录里的分镜恢复原样（原来没有就删掉）；ch02 ep01 的试验分镜是 `video/src/episode/fixtures/ep01-music-trial.storyboard.json`（每个画面一个知识块，配乐用最短的 forgotten path，`npm run test` 检查它能排期）。
- `npm run test` 检查：登记的每首曲子的文件名就是 ID、放在 `music/` 里；记了核对日期和作品页；文件是 OGG/Vorbis，采样率和采样数（读 OGG 最后一页的 granule position）与登记表一致，采样数是一帧采样数的整数倍；`music/` 里除了 `README.md` 没有没登记的文件。曲子文件不进 Git，CI 上没有：缺的那几首跳过读文件的检查（OGG 格式、采样率、采样数），打印一行「本机缺配乐文件 …」说明缺哪几首、去看 `video/public/music/README.md`；其余检查照常跑；`defineMusicLibrary` 收 CC0、CC-BY，拒绝别的许可，CC-BY 缺署名、采样数没对齐时报错；`writeCredits` 用了 CC-BY 曲子时写出署名、CC0 时不写；`musicPlays`、`musicVolume` 排出的循环起点、重叠帧数、淡化曲线，比正文长的曲子不循环。选曲命令保留已有的 `music`、本书第一期从全部曲子里选、上一期在另一章、跳过只有字幕版的一期、结果不等于上一期的曲子；`measureCrossfade` 用合成的波形测过：不相关的曲尾曲首不掉音、反相抵消报掉音、重叠处突然变响报爆音。
