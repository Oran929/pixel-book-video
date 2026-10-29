// 片头片尾的 React 一侧入口（代码审查，PR #49）：片头、片尾的登记表（`intro/intros.ts`、
// `outro/outros.ts`）和动画组件（`*-components.ts`）是成对的，Episode 和 Root 只从这里取。
// 时间轴导出（Node）不引用 React，仍直接读登记表（经 `library.ts` 的 `bookendFrames`）。
import { INTRO_COMPONENTS } from "../intro/intro-components";
import { type IntroId, INTROS } from "../intro/intros";
import { OUTRO_COMPONENTS } from "../outro/outro-components";
import { type OutroId, OUTROS } from "../outro/outros";
import { VOLUME } from "../style/volume";
import { BookendWithAudio } from "./BookendWithAudio";
import type { Bookend, BookendKind } from "./library";

export type { IntroId, OutroId };

type BookendSet = {
  /** Studio 里单独预览的合成 ID 前缀：`Intro-<ID>`、`Outro-<ID>` */
  prefix: string;
  library: Record<string, Bookend>;
  components: Record<string, React.FC>;
  volume: number;
};

const BOOKEND_SETS: Record<BookendKind, BookendSet> = {
  intro: { prefix: "Intro", library: INTROS, components: INTRO_COMPONENTS, volume: VOLUME.intro },
  outro: { prefix: "Outro", library: OUTROS, components: OUTRO_COMPONENTS, volume: VOLUME.outro },
};

/** 成片里项目配置选的片头或片尾：登记的标题帧数音轨、动画组件和音量一起放，从第 `from` 帧起 */
export const SelectedBookend: React.FC<
  ({ kind: "intro"; id: IntroId } | { kind: "outro"; id: OutroId }) & { from?: number }
> = ({ kind, id, from }) => {
  const { library, components, volume } = BOOKEND_SETS[kind];
  return (
    <BookendWithAudio
      bookend={library[id]!}
      component={components[id]!}
      volume={volume}
      from={from}
    />
  );
};

/**
 * 每个登记的片头或片尾一个合成（`Intro-<ID>`、`Outro-<ID>`），单独放它，和参考成片对比。
 * 动画组件不能经 `defaultProps` 传（Remotion 把 props 序列化成 JSON，函数会丢），
 * 所以在模块加载时给每一个包一个不带参数的组件。
 */
export const BOOKEND_PREVIEWS = Object.values(BOOKEND_SETS).flatMap(
  ({ prefix, library, components, volume }) =>
    Object.entries(library).map(([id, bookend]) => {
      const component = components[id]!;
      const Preview: React.FC = () => (
        <BookendWithAudio bookend={bookend} component={component} volume={volume} />
      );
      return { id: `${prefix}-${id}`, Preview, frames: bookend.frames };
    }),
);
