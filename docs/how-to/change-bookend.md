# 换片头片尾

片头片尾的登记规则见 `docs/reference/video.md`「片头和片尾」。下面以片尾为例，片头把 `outro` 换成 `intro`：

1. 新建 `video/src/outro/<新ID>/`，放动画组件（导出一个不带参数的 React 组件，按 30fps、1920×1080 画，从第 0 帧开始，自己用 `useCurrentFrame`）、`timing.json`（至少有帧数 `total`）和生成音轨的脚本；字体、图片放进 `video/public/` 用 `staticFile` 读，用到风格表里的像素字体时不用再加载（`Root.tsx` 已加载）。
2. 生成音轨到 `video/public/outro/<新ID>.wav`（44.1 kHz 双声道 16 位，长度正好是 `total` 帧），在 `tools/tests/test_bookend_audio.py` 的 `BOOKENDS` 里加一行（脚本参数各不相同）。
3. 在 `outro/outros.ts` 登记 `<新ID>: { title, frames: timing.total, audio: "outro/<新ID>.wav" }`，在 `outro/outro-components.ts` 登记它的组件。
4. 把 `project-config.ts` 的 `outro` 改成 `<新ID>`（不要片尾就写 `null`）。旧的不用了可以一起删掉：目录、音轨、两处登记和测试里的那一行。
5. `make check`，再在 Studio 里看 `Outro-<新ID>` 和整期的 `Episode`，`make smoke` 跑一次。
