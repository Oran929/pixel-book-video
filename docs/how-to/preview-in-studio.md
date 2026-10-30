# 在 Studio 里预览

先运行过 `pixelbook render`、`pixelbook voice` 或 `stage`，再：

```sh
cd video && npm run studio
```

在 Studio 里打开 `Episode` 合成。`Intro-<ID>`、`Outro-<ID>` 合成单独放登记的每个片头片尾（见 `docs/reference/video.md`「片头和片尾」）。`StyleSheet` 合成是风格样张（调色板、用途色、字体、描边和阴影、字幕框），`Sample-<组件名>` 是各组件的样张（见 `docs/reference/storyboard.md`「分镜」），都只在 Studio 里看，渲染命令只渲染 `Episode`；要导出成图片：`npx remotion still StyleSheet out/style-sheet.png`。
