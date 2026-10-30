# 加一首配乐

配乐库的登记规则、许可要求和检查见 `docs/reference/storyboard.md`「配乐」。

1. 在作品页上核对许可：只收 `CC0` 和 `CC-BY x.y`；同时给了几种许可时选一种登记。
2. 在 `video/src/music/intake-music.ts` 的 `SOURCES` 里加一项：曲子 ID → 源文件名。
3. 入库（只在本机做，要 ffmpeg 和 oggenc，`brew install vorbis-tools`）：

   ```sh
   cd video
   npm run music:intake -- /path/to/downloads   # 写 public/music/<ID>.ogg，打印采样率和采样数
   npm run music:seams                           # 交叉淡化接缝检查
   ```

4. 在 `video/src/music/tracks.ts` 的 `MUSIC` 里登记：文件、曲名、作者、作品页、许可、核对日期、采样率、采样数（抄入库命令打印的），CC-BY 的写署名 `credit`。
5. 在 `video/public/music/README.md` 的表里加一行（作品页、原件文件名、字节数），改首数和 `docs/reference/storyboard.md`「配乐」里的曲子清单、首数。曲子文件不进 Git，别的机器照 `video/public/music/README.md` 补齐。
6. `make check`。
