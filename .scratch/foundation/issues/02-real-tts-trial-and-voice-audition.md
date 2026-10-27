# 02: 真实 TTS 试跑与音色试听

**What to build:** Qwen3-TTS 1.7B bf16 通过 mlx-audio 在本机跑通（ADR-0002）。有一个音色试听命令：同一段包含术语的测试旁白（例如"DRY""正交性""KV Cache"），分别用 2–3 个 CustomVoice 预设音色和 1–2 个 VoiceDesign 设计的音色各生成一份，我听完选出项目默认音色。如果选中的是设计音色，就保存成参考音频，之后通过 Base 模型克隆来使用。选定结果写进项目默认音色配置。

**Blocked by:** 01

**Type:** HITL（我负责试听和选择）

**Status:** ready-for-human

- [x] 模型下载和首次运行的步骤写进 README
- [x] 试听命令生成每个候选音色的音频，文件名能看出是哪个音色
- [x] 报告每句的生成耗时和峰值内存，估算一期（约 100 句）配音需要多长时间
- [x] 记录哪些术语读错了，作为 04 读音表的初始条目
- [x] 我选定默认音色后，参考音频（如果有）和项目默认音色配置都提交进仓库
- [x] 项目默认音色配置的格式足够描述"模型标识 + 参考音频 + 生成参数"，供 05、06 计算指纹和锁定使用

## Comments

- 来自 01：`.gitignore` 全局忽略 `*.wav`。参考音频要提交时，需要为它所在的位置加一条例外规则（如 `!voices/*.wav`），否则 git 会静默忽略它。

- 来自 02 实现（2026-10-27）：代码部分完成，剩下的是人工步骤。
  - 命令：`uv run pixelbook audition` 按 `voices/audition.yaml` 生成 `out/audition/<音色>-<句号>.wav` 和 `report.json`；`uv run pixelbook choose-voice <名字>` 写 `voice.yaml`。
  - 候选：预设 vivian / serena / uncle-fu，设计 design-calm-male / design-bright-female。设计音色另有 `<名字>-ref.wav`（不含术语的参考句），选中时复制为 `voices/<名字>.wav`，`voice.yaml` 改用 Base 模型克隆；选中预设时 `voice.yaml` 直接记录模型 + speaker。
  - 配置格式：`model`，`speaker` 或 `ref_audio`（相对仓库根目录）+ `ref_text`，`params`（language / temperature / top_p / top_k / repetition_penalty）。05 计算指纹时要读 `ref_audio` 的文件内容。
  - M5 Max 实测（预热后）：CustomVoice / VoiceDesign 每句 0.8–1.9 秒，峰值内存 6.6–7.8 GB；Base 克隆（参考音频 design-calm-male-ref.wav，scratch 脚本测量）每句约 1.1 秒，峰值内存约 8.2 GB。一期 100 句约 2 分钟（不含模型加载）。
  - Qwen3-ASR 粗查：所有候选的音频内容都完整；"DRY" 一律按字母读成 "D R Y"，"KV Cache" 读成 "KV cache"。是否算读错，等试听后决定，结果写进 04 的读音表初始条目。
  - 待人工：试听、选定默认音色、运行 `choose-voice`、提交 `voice.yaml`（和参考音频）、记录读错的术语。
- 选定音色（2026-10-28）：经过 `voices/audition-yujie.yaml` 的几轮试听，选定两个设计音色，都通过参考音频用 Base 模型克隆。
  - 默认配置 1 = tianmei：写进 `voice.yaml`（项目默认音色），参考音频 `voices/tianmei.wav`。
  - 默认配置 2 = yujie：写进 `voices/yujie.yaml`（备用配置，格式和 `voice.yaml` 相同），参考音频 `voices/yujie.wav`。某本书要用这个声音时，通过 06 的书级覆盖引用它。
  - Base 克隆实测：两份配置都正常，每句 1.2–1.5 秒，语速正常。tianmei 试听时 DRY 被读歪（ASR 听成"第二外"），克隆版读对了；yujie 的克隆把 DRY 按字母读成 "D.R.Y"。
  - 还没做：记录读错的术语，作为 04 读音表的初始条目。
- 术语读法（2026-10-28，人工试听）：没有读错的术语。DRY（按字母读）和 KV Cache 在 tianmei、yujie 的克隆样本里我都认可。04 的读音表不需要替换条目；这两个术语可以写成原样不变的已确认条目（`DRY: DRY`、`KV Cache: KV Cache`），免得被当成新术语。
