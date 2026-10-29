// 项目配置（#51）：这个频道每期用哪个片头、哪个片尾。写登记表里的 ID，`null` 是「不用」。
// 换成别的片头片尾：先在 `intro/intros.ts` 或 `outro/outros.ts` 登记，再改这里（README「片头和片尾」）。
// 时间轴、帧数核对和时长判断都按这里选中的那一个的帧数算。
import type { IntroId } from "./intro/intros";
import type { OutroId } from "./outro/outros";

export type ProjectConfig = {
  intro: IntroId | null;
  outro: OutroId | null;
};

export const PROJECT: ProjectConfig = {
  intro: "load-pixel-book",
  outro: "bye-bye",
};
