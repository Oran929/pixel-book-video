# 像素风书籍讲解视频

把书的一章改编成约 5 分钟、像素风、配音与画面同步的讲解视频。术语见 `GLOSSARY.md`，决策见 `docs/adr/`。

## 仓库结构

```
pronunciation.yaml   读音表（全频道共用）
                     项目默认音色配置也放在根目录（文件名和格式由工单 02 确定）
books/<书>/          书配置、锁定音色、配音缓存；书 → 章 → 期
tools/               Python 工具（uv 管理）：旁白稿 → 配音 → 合成清单
video/               Remotion 项目（npm 管理）：合成清单 + 分镜 → MP4
```

## 安装

需要 [uv](https://docs.astral.sh/uv/)、Node.js 和 ffmpeg（`brew install uv node ffmpeg`）。

```sh
make install
```

## 检查

先运行过 `make install`，再运行：

```sh
make check
```

依次运行 pytest、ruff（lint + 格式）、`tsc`、ESLint、Vitest，任何一项失败就以非零码退出。"做完了"的标准就是这条命令通过。

## 预览

```sh
cd video && npm run studio
```
