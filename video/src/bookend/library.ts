// 片头片尾登记表（#51，spec #16 修订三）：片头、片尾各一张表，ID → 标题、帧数、音轨，
// 和配乐库一样导入时校验。动画组件另放在 `intro/intro-components.ts`、`outro/outro-components.ts`
// （按同样的 ID）；这里是纯 .ts、不引用 React 和 remotion：时间轴导出（Node）只要帧数。
// 用哪个片头、哪个片尾（或者不用）写在项目配置 `project-config.ts` 里。
// 片头片尾不是分镜组件：不占网格、没有状态，不进组件目录。

export type BookendKind = "intro" | "outro";

const KIND_NAME: Record<BookendKind, string> = { intro: "片头", outro: "片尾" };

export type Bookend = {
  title: string;
  /** 占的帧数（30fps）：用户工程 `timing.json` 的 `total` */
  frames: number;
  /**
   * 自带的音轨（音乐、音效、配音一体），以 `video/public/` 为起点（交给 staticFile）；
   * 固定是 `<intro|outro>/<ID>.wav`，由各自目录里的 `make_audio.py` 生成
   */
  audio: string;
};

/** 校验登记表：帧数是正整数；音轨是 `<intro|outro>/<ID>.wav` */
export const defineBookendLibrary = <T extends Record<string, Bookend>>(
  kind: BookendKind,
  entries: T,
): T => {
  for (const [id, bookend] of Object.entries(entries)) {
    if (!Number.isInteger(bookend.frames) || bookend.frames <= 0) {
      throw new Error(`${KIND_NAME[kind]} ${id} 的帧数 ${bookend.frames} 不是正整数`);
    }
    const audio = `${kind}/${id}.wav`;
    if (bookend.audio !== audio) {
      throw new Error(`${KIND_NAME[kind]} ${id} 的音轨应为 ${audio}，实际是 ${bookend.audio}`);
    }
  }
  return entries;
};

/** 选中的片头或片尾的帧数；`null` 是「不用」，为 0。没登记的 ID 报错 */
export const bookendFrames = (
  kind: BookendKind,
  library: Record<string, Bookend>,
  id: string | null,
): number => {
  if (id === null) return 0;
  const bookend = Object.hasOwn(library, id) ? library[id] : undefined;
  if (!bookend) {
    throw new Error(
      `${KIND_NAME[kind]} ${id} 没有登记；登记过的：${Object.keys(library).join("、")}`,
    );
  }
  return bookend.frames;
};
