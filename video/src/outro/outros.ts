// 片尾登记表（#51）：ID → 标题、帧数、音轨。换片尾的步骤见 README「片头和片尾」。
import { defineBookendLibrary } from "../bookend/library";
import byeBye from "./bye-bye/timing.json";

export const OUTROS = defineBookendLibrary("outro", {
  /** 用户做的片尾（#51）：四个小人被元素墙追着跑 → 铺满 → 翻出 BYE-BYE → CRT 关机 */
  "bye-bye": {
    title: "BYE-BYE",
    frames: byeBye.total,
    audio: "outro/bye-bye.wav",
  },
});

export type OutroId = keyof typeof OUTROS;
