# 配乐文件（只在本机）

这个目录在 Git 里只有这份说明：曲子文件 `<ID>.ogg` 不进 Git（`.gitignore` 忽略，spec #16 修订四，#53）。登记表 `video/src/music/tracks.ts` 的 `MUSIC` 照旧提交，记着每首的 ID、作品页 `source`、采样率 `sampleRate`、采样数 `sampleCount`。

缺文件时：`npm run test` 跳过读曲子文件的检查并打印「本机缺配乐文件 …」；`pixelbook render`、`pixelbook music-trial`、`make smoke`、`npm run music:seams` 报错。照下面三步补齐。

## 1. 拿到原件

本机快捷来源：`/Users/oranjuuuu/Downloads/Slowly Music`，里面就是下表「原件文件名」那 8 个文件，可以直接用，跳到第 2 步。

没有这个目录时，从 OpenGameArt 作品页下载下表的那个文件（同一页常有几个版本，只认表里这个；8 个文件和 `Slowly Music` 里的逐字节相同，字节数可以用来核对），放进一个新目录，**改名成「原件文件名」**（入库命令按这个名字找，见 `video/src/music/intake-music.ts` 的 `SOURCES`）。

| ID | 作品页 | 下载的文件 | 字节数 | 原件文件名 |
| --- | --- | --- | --- | --- |
| `ooame` | https://opengameart.org/content/ooame | `8_bit_ooame_lofi_0.mp3` | 8137582 | `01 Ooame - TAD.mp3` |
| `iced-village` | https://opengameart.org/content/iced-village-8-bit-lofi-hip-hop | `8_bit_iced_village_lofi_0.mp3` | 14081798 | `02 Iced Village - TAD.mp3` |
| `the-past` | https://opengameart.org/content/the-past-8-bit-lofi-hip-hop | `the_past_8_bit_lofi__0.mp3` | 5949984 | `03 The Past - TAD.mp3` |
| `since-2-am` | https://opengameart.org/content/since-2-am | `since_2_a.m_0.mp3`（不是 `.wav`） | 4109292 | `04 Since 2 AM - TAD.mp3` |
| `forgotten-path` | https://opengameart.org/content/forgotten-path | `forgotten_path_0.ogg`（不是 flac / wav / mid） | 1037069 | `05 Forgotten Path - johndekale.ogg` |
| `slow-melancholic-theme` | https://opengameart.org/content/slow-melancholic-theme-c64-style | `slow_melancholic_theme_c64_style_long_version_with_refrain.ogg`（带副歌的长版） | 3171773 | `06 Slow Melancholic Theme (long) - skrjablin.ogg` |
| `tiny-sad-lonely-theme` | https://opengameart.org/content/tiny-sad-lonely-theme | `tiny_sad_lonly_theme.ogg` | 2393930 | `07 Tiny Sad Lonely Theme - MAOU.ogg` |
| `kalypo` | https://opengameart.org/content/kalypo | `kalypo.flac` | 59392274 | `08 Kalypo - Spring Spring.flac` |

下载链接是 `https://opengameart.org/sites/default/files/<下载的文件>`。字节数对不上，说明作品页换了文件：停下来告诉用户，不要入库。

## 2. 入库

要 ffmpeg 和 oggenc（`brew install vorbis-tools`）。

```sh
cd video
npm run music:intake -- "/Users/oranjuuuu/Downloads/Slowly Music"   # 或第 1 步的目录；写出 public/music/<ID>.ogg
npm run music:seams                                                  # 交叉淡化接缝检查，8 首都应是「不掉音、不爆音」
```

## 3. 核对

`music:intake` 每首打印一行「…截到 N（… 帧）…，R Hz」。逐首比对：N 等于登记表里这首的 `sampleCount`，R 等于 `sampleRate`。再跑

```sh
cd video && npm run -s test -- src/music
```

完成的标志：8 首都对上，测试输出里没有「本机缺配乐文件」，`ls video/public/music` 是这份 README 加 8 个 `<ID>.ogg`。有一首对不上时，登记表才是准的：别改登记表，把差异报给用户。
