// 片头登记表（#51）：ID → 标题、帧数、音轨。换片头的步骤见 docs/how-to/change-bookend.md「换片头片尾」。
import { defineBookendLibrary } from "../bookend/library";
import loadPixelBook from "./load-pixel-book/timing.json";

export const INTROS = defineBookendLibrary("intro", {
  /** 用户做的片头（#50）：终端打出 LOAD "PIXEL BOOK" → 选角色 → 标题 → CRT 关机 */
  "load-pixel-book": {
    title: 'LOAD "PIXEL BOOK"',
    frames: loadPixelBook.total,
    audio: "intro/load-pixel-book.wav",
  },
});

export type IntroId = keyof typeof INTROS;
