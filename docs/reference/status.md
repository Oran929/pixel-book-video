# 进度判断

`pixelbook status <期目录>` 只看文件，判断一期做到哪一步、停在哪个人工关口、下一步跑什么命令或 skill。不依赖记忆或对话，换一个 agent 来接手，结论也一样。代码在 `tools/src/pixelbook/status.py`。

```sh
cd tools
uv run pixelbook status ../books/pragmatic-programmer/ch02/ep01          # 中文的人读文本
uv run pixelbook status ../books/pragmatic-programmer/ch02/ep01 --json   # 给 /episode 读的 JSON
```

退出码：判断成功时为 0，不管有没有下一步；期目录不合法、或者要读的大纲和旁白稿格式不对时为 1，并打印原因。不合法指：路径不是 `books/<书>/chNN/<期>/`，章目录不存在，路径是文件而不是目录，或者不在 Git 仓库里。大纲和旁白稿用 `pixelbook outline`、`pixelbook check` 同一套加载规则读，格式不对时报第一处错，让你先跑对应的命令修好。期目录本身还没建（比如还没写旁白稿）是合法的。

命令和 skill 里的路径都相对仓库根目录写；命令在 `tools/` 下用 `uv run` 跑时，路径前面加 `../`。

## 阶段

下表的「提交」指提交进书目录所在的 Git 仓库：自己的书是 `books/` 里只在本机的书仓库，范例 `examples/books/` 是项目仓库（[ADR-0014](../adr/0014-own-books-in-local-books-repo.md)）。书目录被所在的仓库忽略时（书仓库还没建），`status` 报错，不会一直停在关口 1。

按下表从上往下判断，停在第一个成立的阶段。

| 阶段 ID | 阶段 | 条件 | 人工关口 | 下一步 |
|---|---|---|---|---|
| `not-in-outline` | 大纲里没有这一期 | 章目录里没有 `outline.yaml`，或者它的 `episodes[].id` 里没有期目录名 | | `/outline <书> <章>` |
| `outline-review` | 大纲待审 | 大纲里**这一期的条目**没提交进 Git，或者提交后又改过（和 `/outline`「审过才提交」一致）。只比本期条目：HEAD 里的本期条目和工作区的一样就算审过；往大纲里加别的期、改别的期，不影响已经审过的期 | 1 | 人审大纲，审过后提交 |
| `no-script` | 没有旁白稿 | 期目录里没有 `script.yaml` | | `/script <期目录>` |
| `script-review` | 旁白稿待审 | 没有 `factcheck.yaml` | | `/factcheck <期目录>` |
| `script-review` | 旁白稿待审 | 有 `factcheck.yaml`，`status` 不是 `final` | 2 | 人审旁白稿和语义核对结果，审过后按 `/script` 第 7 步定稿、提交 |
| `ready-to-voice` | 定稿待配音 | 产物目录里没有合成清单 `episode.json`，或者它比配音的输入旧（见下） | | `pixelbook terms <旁白稿>`，然后 `pixelbook voice <旁白稿>` |
| `no-storyboard` | 没有分镜 | 期目录里没有 `storyboard.json` | | `/storyboard <期目录>` |
| `ready-to-render` | 待渲染 | 没有时间轴 `timeline.json` 或成片 `<书>-<章>-<期>.mp4`，或者它们比输入旧 | | `pixelbook render <旁白稿>` |
| `video-review` | 成片待审 | 分镜没提交进 Git，或者提交后又有改动 | 3 | 人看成片、配乐署名 `credits.txt`（有的话）和「表现不了」清单，审过后提交分镜 |
| `done` | 已完成 | 以上都不成立 | | 无 |

停在人工关口时下一步为空，由人审；审过之后再跑一次 `status`，它会从停下的地方往下判断。

## 成片已审

关口 3 的「成片已审」以**分镜已经提交进 Git、工作区没有改动**为准，不另外留审过的标记。`/storyboard` 本来就是「分镜先不提交，用户说通过时提交 `storyboard.json`」，所以人不用为 `status` 多做任何事；和关口 1 以大纲提交为准是同一个做法。审过之后再改分镜，分镜又成了未提交的改动，比时间轴新，`status` 会先要求重新渲染，再停在关口 3。

## 产物过期

产物比它的输入旧（按文件的修改时间）时，`status` 不报「已完成」，而是报出过期原因和从哪一步重跑（JSON 里的 `stale`、`rerun_from`）：

| 产物 | 输入 | 从哪一步重跑 | 阶段 |
|---|---|---|---|
| 合成清单 `out/episode.json` | 旁白稿 `script.yaml`、读音表 `pronunciation.yaml`、书配置 `books/<书>/book.yaml`、书用的音色配置（`book.yaml` 的 `voice` 引用的文件，没写就是 `voice.yaml`）；不存在的文件不比 | 配音 | 定稿待配音 |
| 时间轴 `out/timeline.json` | 合成清单、分镜 `storyboard.json` | 时间轴 | 待渲染 |
| 成片 `out/<书>-<章>-<期>.mp4` | 时间轴 | 渲染 | 待渲染 |

修改时间只看文件本身：`git checkout`、`git pull` 改写过的文件也算更新过，所以换分支之后可能报过期。重跑代价不大（配音有缓存），宁可多跑一次。

## JSON

`--json` 输出一个对象：

- `episode`：期目录，相对仓库根目录。
- `stage`、`label`：阶段 ID 和中文名，见上面的表。
- `gate`：人工关口编号 1–3，不在关口时为 `null`。
- `next`：agent 下一步依次要跑的命令或 skill（字符串列表）；停在关口或已完成时为空列表。
- `review`：停在关口时交给人审的内容和审过之后要做的事，其余为 `null`。
- `stale`：过期原因，每条一句；没有过期时为空列表。
- `rerun_from`：从哪一步重跑（`配音`、`时间轴`、`渲染`），没有过期时为 `null`。
