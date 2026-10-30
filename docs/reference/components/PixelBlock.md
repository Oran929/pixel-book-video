# 知识块 `PixelBlock`

- **效果**：一个带字的像素方块，从上方落下，可以高亮或标成已改
- **适合表达**：书里的一个概念、一段知识、一份东西（代码、文档、数据库 Schema）；落下、复制、高亮、只改了一处

## 调用示例

```json
{ "id": "dry", "component": "PixelBlock", "props": { "label": "DRY", "size": "medium", "color": "orange" }, "at": [1, 1] }
```

## 参数

| 参数 | 类型 | 必填 | 取值范围 | 显示文字 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `label` | 字符串 | 必填 | 不空 | 是 | 方块上的字，一行，单行居中、不换行、不加字距 |
| `size` | 字符串 | 必填 | `small`、`medium`、`large` | 否 | 大小，同时决定占几格和标签的字号（见「占几格」） |
| `color` | 字符串 | 必填 | `orange`、`green`、`blue`、`purple`、`cream`、`stone` | 否 | 风格表 `BLOCK_COLORS` 里的名字（黄色和红色留给状态） |

「显示文字」参数的值必须出自本画面的画面说明或旁白句（见 `docs/reference/storyboard.md`「显示文字」）；字放不下怎么算见 `docs/reference/storyboard.md`「字宽估算」。

## 占几格

按 `size`。方块占满格子，右下留出硬阴影的偏移：

| `size` | 占几格（列 × 行） | 字号 | 标签最多多宽 |
| --- | --- | --- | --- |
| `small` | 2 × 1 | 24（`FONT_SIZE.small`） | 216 像素（约 9 个汉字） |
| `medium` | 3 × 2 | 48（`FONT_SIZE.subtitle`） | 364 像素（约 7 个汉字） |
| `large` | 4 × 3 | 96（`FONT_SIZE.large`） | 512 像素（约 5 个汉字） |

标签最多多宽 = 格子宽 − 两侧粗描边 `SIZE.strokeThick` − 硬阴影 `SIZE.shadowOffset` − 两侧内边距 `SIZE.blockPadding`。放不下时报错：换大一号的 `size` 或缩短标签。

## 状态

第一个状态是初始状态。切到某个状态时放表里的音效（入场时只放入场音效，不放初始状态的音效；之后切回初始状态时才放）。

| 状态 | 画面上 | 切到时的音效 |
| --- | --- | --- |
| `normal`（初始） | 深色描边和阴影 | `blip` |
| `highlight` | 描边和阴影变黄 | `blip` |
| `changed` | 已改：描边和阴影变红 | `buzz` |

切到 `highlight`、`changed` 时跳一下（`SIZE.blockHop`，0.4 秒）。

## 入场和退场动画

- 入场默认 `slide`，退场默认 `fade`（分镜不写 `animation` 时）。
- 都能用通用动画 `fade`、`slide`、`none`。取值见 `docs/reference/storyboard.md`「分镜」。

入场的 `slide` 是从上方落下。

## 音效

入场 `drop`，退场 `leave`；切到各状态的音效见「状态」。音效 ID 见 `docs/reference/storyboard.md`「音效」。

## 嵌套

`large` 的标签只占中间一行（`[0, 1]` 起 4×1 格；行高 128 像素居中，字形落在中间一行里），上下两行可以嵌子组件；`medium`、`small` 的标签占满整个方块，不能嵌子组件。

## 样张

Studio 里的 `Sample-PixelBlock`：三种入场和退场动画；六种颜色；入场、高亮、已改、切回、退场；最后一个画面演嵌套。
