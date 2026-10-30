# 某本书改用 yujie

书的音色默认是项目默认音色 `voice.yaml`（tianmei）。只有用户明确说「这本书用 yujie」时才改，agent 不自己换音色。规则见 `docs/reference/voice.md`「书的音色与锁定」。

1. 在 `books/<书>/book.yaml` 里加一行：

   ```yaml
   voice: voices/yujie.yaml
   ```

2. 这本书还没配过音（没有 `books/<书>/voice.lock`）：照常 `pixelbook voice` 或 `render`，第一次成功配音时锁定 yujie。
3. 这本书已经配过音：`voice` 会报音色和锁定不一致、列出两边的值。确认整本书换音色后，对每一期加 `--revoice` 重配：

   ```sh
   cd tools
   uv run pixelbook render ../books/<书>/chNN/epNN/script.yaml --revoice
   ```

   第一期 `--revoice` 更新锁定，之后这本书其他配过的期也要各自再跑一次（锁定已经是 yujie，不用再加 `--revoice`）。
4. 提交 `book.yaml` 和 `voice.lock`。

音色按书锁定的理由见 [ADR-0005](../adr/0005-voice-locked-per-book.md)。
