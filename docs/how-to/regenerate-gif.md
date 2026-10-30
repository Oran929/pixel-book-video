# 重新生成 README 的 GIF

README 的 GIF 是从 ep01 成片截的一段，放在 `docs/media/ep01.gif`。换了成片之后照下面重新生成。

1. 先出片：`cd tools && uv run pixelbook render ../books/pragmatic-programmer/ch02/ep01/script.yaml`。
2. 在成片里挑 4–6 秒组件动画密集的片段，记下开始的秒数。现在的 GIF 从第 162 秒开始，截 5 秒（「知识」分出文档、规范、代码、测试四个箭头），约 62 KB。换片段时改命令里的 `-ss`。
3. 用 ffmpeg 转成宽 640 的 GIF（先生成调色板，再按调色板转；最近邻缩放，像素边缘不糊）：

   ```sh
   ffmpeg -y -ss 162 -t 5 \
     -i books/pragmatic-programmer/ch02/ep01/out/pragmatic-programmer-ch02-ep01.mp4 \
     -vf "fps=12,scale=640:-1:flags=neighbor,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none" \
     -loop 0 docs/media/ep01.gif
   ```

4. `ls -l docs/media/ep01.gif` 不超过 2 MB。超了就缩短 `-t`、降低 `fps` 或 `max_colors`。
5. 在 GitHub 上打开 README 看一眼能正常播放，再提交。
