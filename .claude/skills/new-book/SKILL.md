---
name: new-book
description: 开一本新书：建书目录、放入 EPUB、跑 pixelbook convert、写 book.yaml，用项目默认音色。
argument-hint: <EPUB 路径> <书的英文 slug>
disable-model-invocation: true
---

# /new-book <EPUB 路径> <书>

参数：`$ARGUMENTS`。`<书>` 是书目录名，英文小写、单词之间用连字符（如 `pragmatic-programmer`）。

- **输入**：一本 EPUB。
- **输出**：书目录 `books/<书>/`：原书 `source.epub`、转换结果 `chapters/chNN.md`（都不提交）、书配置 `book.yaml`（提交到书仓库）。
- **音色**：新书用项目默认音色 `voice.yaml`（tianmei），第一次配音时锁定（[ADR-0005](../../../docs/adr/0005-voice-locked-per-book.md)：音色按书锁定）。这份 skill 不试听、不挑选音色，`book.yaml` 里不写 `voice`。只有用户在对话里明确说这本书用 yujie 时，才写 `voice: voices/yujie.yaml`。

## 步骤

### 1. 建书目录

`books/<书>/` 已经存在时停下，告诉用户这本书已经开过。否则建目录，把 EPUB 复制成 `books/<书>/source.epub`。

**完成**：`books/<书>/source.epub` 在。

### 2. 转换

```sh
cd tools && uv run pixelbook convert ../books/<书>
```

规则和报错的处理见 `docs/reference/convert.md`「原书转换」：报错时先在 `tools/src/pixelbook/convert.py` 里补规则（测试先行），再重新转换。

**完成**：退出码 0，`books/<书>/chapters/` 里有每章的 `chNN.md`。

### 3. 写书配置

按 `docs/reference/voice.md`「书的音色与锁定」写 `books/<书>/book.yaml`：书名 `title`、作者 `author`、出版社 `publisher`，取自 EPUB 里 OPF 的 `dc:title`、`dc:creator`、`dc:publisher`；读不到的字段省略。`voice` 只在用户明确指定 yujie 时写。

**完成**：`book.yaml` 写好；`books/<书>/voice.lock` 不存在（第一次配音时才写）。

### 4. 提交，交给用户

只把 `book.yaml` 提交到书仓库（`git -C books add …` 再 `git -C books commit`，见 ADR-0014）。书仓库是 `books/` 里只在本机的 Git 仓库，项目仓库忽略整个 `books/`；第一次 `convert` 时会建好。用中文汇报：

- 书目录和转换出的章数（`chNN.md` 列表）；
- `book.yaml` 的内容；
- 音色：默认 tianmei，还是用户指定的 yujie；第一次配音时锁定，之后换音色要整本书重新配音。

下一步是 `/episode <书> <章> <期>`。
