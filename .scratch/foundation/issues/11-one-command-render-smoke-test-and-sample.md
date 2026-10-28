# 11: 一键渲染、冒烟测试与样片验收

**What to build:** 一条命令完成"跑配音流水线（含复制到 Remotion 静态目录）→ 导出时间轴、打点时间表和总时长 → 渲染 MP4 → 汇总检查报告"。冒烟测试用一份固定的小样例真实渲染一次，检查 MP4 时长与计算时长相差不超过一帧。最后用 02 选定的默认音色，产出约 20 秒的样片，交给我整体验收。这标志着"音频驱动画面"已经被证实。

**Blocked by:** 06、07、09、10

**Type:** HITL（我做最终验收）

**Status:** ready-for-agent

- [ ] 一键命令在任何一步失败时都会停下，并指出是哪一步、原因是什么
- [ ] 冒烟测试是一条单独的命令，不放进每次都跑的统一检查（`make check`）里
- [ ] 冒烟测试用假 TTS 引擎（静音 wav）和假语音识别引擎，加上一份固定的小样例旁白稿，不加载任何真实模型；它验证的是"渲染管线和时长"，不是音质
- [ ] 冒烟测试用 ffprobe 读 MP4 **视频流**的帧数，与 `timeline.json` 的总帧数比较，相差不超过一帧；不比较音频流时长（最后一句的音频可能比视频短）
- [ ] 样片：默认音色、字幕逐句同步、组件在指定的旁白句出现、风格表和频道形象初版都生效
- [ ] README 写明从旁白稿到 MP4 的完整操作步骤
- [ ] 人工验收：我验收样片后，写一份简短回顾，记下哪些假设被推翻、哪些需要调整，作为阶段 3–4 spec 的输入

## Comments

- 来自 03（2026-10-28）：渲染命令是 `cd video && npm run render -- <输出路径>`（即 `remotion render Episode`）。合成 ID 是 `Episode`，总帧数由 `calculateMetadata` 读 `video/public/episode/episode.json` 后算出，没有这个文件时渲染会报错并提示先运行 `pixelbook voice` / `stage`。03 的实测：样例 7 句渲染 673 帧，约 23 秒（M5 Max）。
- 来自 06（2026-10-28）：`voice_episode` 多了 `revoice` 参数，音色和书的 `voice.lock` 不一致时抛 `PipelineError`（一键命令应把它当作"配音"这一步失败报出来，并把 `--revoice` 透传）。冒烟测试的固定小样例如果放在一本书目录下，首次运行会写 `voice.lock`；用临时目录或忽略它，不要污染 `books/sample/voice.lock`。样例书的 `voice.lock` 已按当前 `voice.yaml`（tianmei）写好，改默认音色后出样片需要 `--revoice`。`--revoice` 目前只重配指定的一期，如果一键命令要支持"整本书重配"，需要定一期上屏到 `video/public/episode/`。
