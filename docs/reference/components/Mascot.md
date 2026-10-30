# 小人 `Mascot`

- **效果**：Q 版频道小人，一个或一群，头顶能冒问号或感叹号
- **适合表达**：人物做什么：一群上师和大神、程序员头顶冒问题、恍然大悟

## 调用示例

```json
{ "id": "host", "component": "Mascot", "props": { "character": "reader" }, "at": [0, 1] }
```

## 参数

| 参数 | 类型 | 必填 | 取值范围 | 显示文字 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `character` | 字符串，或字符串数组 | 必填 | `dragon`、`reader`、`whale`、`gothic`；数组至少 1 项 | 否 | Q 版角色，按外观起名（见风格表 `MASCOTS`）；一群人时可以写一串，从左往右一人一个，不够时从头循环 |
| `count` | 整数 | 可选 | ≥ 1 | 否 | 几个人，不写是 1 |
| `formation` | 字符串 | 可选 | `row`、`crowd` | 否 | 排法，不写是 `row` |

一群人的写法：

```json
{ "id": "gurus", "component": "Mascot", "props": { "character": ["dragon", "whale", "gothic", "reader"], "count": 5, "formation": "crowd" }, "at": [3, 2] }
```

## 占几格

一个小人 2 列 × 3 行。`row` 每人隔一块格子的宽，占 `2 × 人数` 列 × 3 行（一排最多 6 人占满 12 列）；`crowd` 每人只隔一列、左右挤着有一点遮挡，从 0 数的单数位站后排、比前排高一行、被前排挡住，占 `人数 + 1` 列 × 4 行（只有一个人时和 `row` 一样，2 × 3）。超出网格照常报越界。

## 状态

第一个状态是初始状态。切到某个状态时放表里的音效（入场时只放入场音效，不放初始状态的音效；之后切回初始状态时才放）。

| 状态 | 画面上 | 切到时的音效 |
| --- | --- | --- |
| `normal`（初始） | 头顶没东西 | 不放 |
| `question` | 头顶冒问号 | `blip` |
| `exclaim` | 头顶冒感叹号 | `ding` |

一群人一起冒同一个符号。

## 入场和退场动画

- 入场默认 `fade`，退场默认 `fade`（分镜不写 `animation` 时）。
- 都能用通用动画 `fade`、`slide`、`none`。取值见 `docs/reference/storyboard.md`「分镜」。

## 音效

入场 `pop`，退场 `leave`；切到各状态的音效见「状态」。音效 ID 见 `docs/reference/storyboard.md`「音效」。

## 嵌套

没有要让开的字，子组件可以嵌在任何格子里。

## 细节

- **尺寸**（#42 人工关口，用户选了 1/2 缩小）：图片按原图的 1/2（风格表 `MASCOT_SCALE`、`mascotSize`，四舍五入到整数像素）、最近邻插值显示，约 187–220 × 280–296 像素。一个小人的格数由 `mascotCells()` 算：最宽、最高的角色按显示尺寸向上取整到整格，高度还要放下头顶的符号；在自己那块格子里底边对齐、水平居中。
- **符号**：从下面升上来、淡入（一个通用动画的时长），之后每 0.5 秒（`MOTION.mascotSymbolBobSeconds`）上下浮动一格像素；切回 `normal` 时原地淡出。符号是风格表 `MASCOT_SYMBOLS` 里的 5×7 点阵（每点 `SIZE.mascotSymbolDot`，外面一圈 `ink` 描边），不是字体里的「？」「！」（组件不渲染参数以外的固定文字）；颜色 `COLOR.mascotQuestion`（黄）、`COLOR.mascotExclaim`（红）。符号画在小人自己的格子里，不压到上面的组件（`mascot-look.test.ts` 检查）。
- 图片不是对齐网格的像素画，1/2 后「像素」大小不一，1 像素宽的描边有些地方断续（用户看过样帧认可）。图片是从 `character/Q.png` 裁出的透明底 PNG（`video/public/character/`，裁图脚本 `character/crop_q.py`）。

## 样张

Studio 里的 `Sample-Mascot`：四个角色四种入场和退场动画；一个小人冒问号、换感叹号、切回；三人一排一起冒问号，五人一群一起冒感叹号。
