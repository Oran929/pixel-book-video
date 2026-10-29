import type { EpisodeManifest } from "./manifest";

// 显示文字检查（#36，spec #16 修订 D4）：组件上显示的每一段字，都必须是本画面的
// 画面说明或某个旁白句原句（合成清单的 `text`）的子串。两边先做 NFKC 规范化，
// 再去掉 `，。、；` 和空白。NFKC 会把全角逗号、分号变成半角，所以半角的 `,` `;` 也一并去掉。
// 这条检查只挡得住原文以外的词，挡不住拼凑（每项单独比，但几项摆在一起照样能拼出新意思）。

const IGNORED = new Set([..."，。、；".normalize("NFKC")]);

/** 比对前的规范化：NFKC，去掉 `，。、；` 和空白 */
export const normalizeDisplayText = (text: string): string =>
  [...text.normalize("NFKC")]
    .filter((char) => !IGNORED.has(char) && !/\s/u.test(char))
    .join("");

/** 画面 `scene` 的出处：画面说明和本画面的每个旁白句，已规范化 */
export const displayTextSources = (
  manifest: EpisodeManifest,
  scene: string,
): string[] => [
  ...manifest.scenes.filter((s) => s.id === scene).map((s) => s.description),
  ...manifest.lines.filter((l) => l.scene === scene).map((l) => l.text),
].map(normalizeDisplayText);

/**
 * 一段显示文字的问题；没有问题时为 null。
 * `sources` 是 `displayTextSources` 的结果，`name` 用在报错里（比如「组件 sign（Sign）」）。
 */
export const displayTextProblem = (
  text: string,
  sources: string[],
  scene: string,
  name: string,
): string | null => {
  const normalized = normalizeDisplayText(text);
  if (normalized === "") {
    return `${name}的显示文字「${text}」去掉标点和空白后是空串`;
  }
  if (sources.some((source) => source.includes(normalized))) return null;
  return `${name}的显示文字「${text}」不在画面 ${scene} 的画面说明和旁白句里`;
};
