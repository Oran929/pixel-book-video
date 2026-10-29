import { z } from "zod";
import {
  type Animation,
  ANIMATIONS,
  animationFrames,
  type Cells,
  type ComponentDeclarations,
  displayTextFields,
} from "../components/declaration";
import { isSoundId, type Sound, type SoundCue, SOUNDS, type SoundId } from "../sound/sounds";
import { isMusicId, MUSIC } from "../music/tracks";
import { LAYOUT } from "../style/grid";
import { displayTextProblem, displayTextSources } from "./display-text";
import type { EpisodeManifest } from "./manifest";
import type { FrameSpan, PauseOverrides, Timeline } from "./timeline";

// 分镜（spec「分镜（JSON）」）：每个画面用哪些组件、哪个旁白句触发什么动画。
// 只引用 ID 和偏移秒数，不写绝对时间（ADR-0003）。
const Placement = {
  /** 本画面里组件的 id */
  target: z.string(),
  /** 本画面里的旁白句 ID */
  line: z.string(),
  /** 相对旁白句开始的秒数，可以为负 */
  offset: z.number(),
  /**
   * 替换这个动作的默认音效：登记过的音效 ID，或 null（不放）；不写就用组件声明的默认音效。
   * 动画是 `none` 的入场和退场不放音效，不能写音效 ID。
   */
  sound: z.string().nullable().optional(),
};

// 触发只有三种动作（ADR-0011）：入场、退场、切换到组件声明过的状态
const TriggerShape = z.discriminatedUnion("action", [
  z.strictObject({
    ...Placement,
    action: z.literal("enter"),
    /** 不写就用组件声明的默认入场动画 */
    animation: z.enum(ANIMATIONS).optional(),
  }),
  z.strictObject({
    ...Placement,
    action: z.literal("exit"),
    /** 不写就用组件声明的默认退场动画 */
    animation: z.enum(ANIMATIONS).optional(),
  }),
  z.strictObject({
    ...Placement,
    action: z.literal("state"),
    /** 组件声明过的状态名 */
    state: z.string(),
  }),
]);

const StoryboardShape = z.strictObject({
  scenes: z.array(
    z.strictObject({
      /** 合成清单里的画面 ID */
      scene: z.string(),
      components: z.array(
        z.strictObject({
          /** 这个组件在本画面里的名字，供触发引用 */
          id: z.string(),
          /** 组件注册表里的组件名 */
          component: z.string(),
          props: z.record(z.string(), z.unknown()),
          /** 左上角所在的格 `[列, 行]`，从 0 开始；连线类组件不写 */
          at: z
            .tuple([z.number().int().min(0), z.number().int().min(0)])
            .optional(),
          /** 父组件的 id：有意嵌套，格子和区间都落在父组件里，不算重叠；连线类组件不写 */
          parent: z.string().optional(),
          /** 连线类组件（箭头）的起点和终点：本画面里两个按格子摆放的组件的 id；其余组件不写 */
          from: z.string().optional(),
          to: z.string().optional(),
        }),
      ),
      triggers: z.array(TriggerShape),
    }),
  ),
  /** 配乐登记表（`music/tracks.ts`）里的曲子 ID：全期循环播放，最后 2 秒淡出 */
  music: z.string({ error: "有分镜时要写 music：配乐登记表里的曲子 ID" }),
  /** 个别位置的停顿覆盖：`after` 这句之后停顿 `seconds` 秒 */
  pauses: z.array(
    z.strictObject({ after: z.string(), seconds: z.number().min(0) }),
  ),
});

export type Storyboard = z.infer<typeof StoryboardShape>;

const declarationOf = (components: ComponentDeclarations, name: string) =>
  Object.hasOwn(components, name) ? components[name] : undefined;

const storyboardSchema = (
  manifest: EpisodeManifest,
  components: ComponentDeclarations,
) => {
  const scenes = new Set(manifest.scenes.map((scene) => scene.id));
  const lines = new Map(manifest.lines.map((line) => [line.id, line]));
  const lastLine = manifest.lines.at(-1)?.id;
  return StoryboardShape.superRefine((storyboard, ctx) => {
    const issue = (path: PropertyKey[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    const seenScenes = new Set<string>();
    storyboard.scenes.forEach((scene, i) => {
      const at = (...path: PropertyKey[]) => ["scenes", i, ...path];
      if (!scenes.has(scene.scene)) {
        issue(at("scene"), `画面 ${scene.scene} 不存在`);
      } else if (seenScenes.has(scene.scene)) {
        issue(at("scene"), `画面 ${scene.scene} 已经写过，同一画面合并成一项`);
      }
      seenScenes.add(scene.scene);

      const ids = new Set<string>();
      scene.components.forEach((used, j) => {
        if (ids.has(used.id)) {
          issue(at("components", j, "id"), `本画面已有组件 ${used.id}`);
        }
        ids.add(used.id);
        const declared = declarationOf(components, used.component);
        if (!declared) {
          issue(
            at("components", j, "component"),
            `组件 ${used.component} 不在组件注册表里`,
          );
          return;
        }
        const result = declared.props.safeParse(used.props);
        result.error?.issues.forEach((problem) =>
          issue(at("components", j, "props", ...problem.path), problem.message),
        );
        const name = `组件 ${used.id}（${used.component}）`;
        if (result.success && scenes.has(scene.scene)) {
          const sources = displayTextSources(manifest, scene.scene);
          const values = result.data as Record<string, unknown>;
          displayTextFields(declared.props).forEach((key) => {
            const value = values[key];
            if (value === undefined) return;
            const texts = Array.isArray(value)
              ? value.map((text, k) => ({ text: String(text), path: [key, k] }))
              : [{ text: String(value), path: [key] }];
            texts.forEach(({ text, path }) => {
              const problem = displayTextProblem(text, sources, scene.scene, name);
              if (problem) issue(at("components", j, "props", ...path), problem);
            });
          });
        }
        const where = at("components", j, "at");
        if (declared.connector) {
          if (used.at) issue(where, `${name}是连线类组件，不写 at`);
          if (used.parent !== undefined) {
            issue(at("components", j, "parent"), `${name}是连线类组件，不写 parent`);
          }
          (["from", "to"] as const).forEach((end) => {
            const target = used[end];
            const path = at("components", j, end);
            if (target === undefined) {
              issue(path, `${name}是连线类组件，要写 ${end}：本画面里一个组件的 id`);
              return;
            }
            const other = scene.components.find((c) => c.id === target);
            if (!other) {
              issue(path, `${name}指向的 ${target} 不是本画面的组件`);
            } else if (declarationOf(components, other.component)?.connector) {
              issue(path, `${name}指向的 ${target} 是连线类组件，箭头只能连按格子摆放的组件`);
            }
          });
          if (used.from !== undefined && used.from === used.to) {
            issue(at("components", j, "to"), `${name}的 from 和 to 都是 ${used.to}`);
          }
          return;
        }
        (["from", "to"] as const).forEach((end) => {
          if (used[end] !== undefined) {
            issue(at("components", j, end), `${name}不是连线类组件，不写 ${end}`);
          }
        });
        if (used.parent !== undefined) {
          const path = at("components", j, "parent");
          const k = scene.components.findIndex((c) => c.id === used.parent);
          const parent = scene.components[k];
          if (used.parent === used.id) {
            issue(path, `${name}不能是自己的父组件`);
          } else if (!parent) {
            issue(path, `${name}的父组件 ${used.parent} 不是本画面的组件`);
          } else if (declarationOf(components, parent.component)?.connector) {
            issue(path, `${name}的父组件 ${used.parent} 是连线类组件，不能当父组件`);
          } else if (k >= j) {
            // 后写的画在上面：父组件先写，子组件才不会被它盖住（也排除了环）
            issue(path, `${name}要写在父组件 ${used.parent} 后面（后写的画在上面）`);
          }
        }
        if (!used.at) {
          issue(where, `${name}要写 at：左上角所在的格 [列, 行]`);
          return;
        }
        if (!result.success) return;
        const [column, row] = used.at;
        const [columns, rows] = declared.cells(result.data);
        const overflow = [
          column + columns > LAYOUT.columns ? "右边" : null,
          row + rows > LAYOUT.rows ? "下边" : null,
        ].filter((side) => side !== null);
        if (overflow.length > 0) {
          issue(
            where,
            `组件 ${used.id} 从 [${column}, ${row}] 起占 ${columns}×${rows} 格，超出 ${LAYOUT.columns}×${LAYOUT.rows} 网格的${overflow.join("和")}`,
          );
        }
      });

      // 每个组件恰好一次入场、最多一次退场、任意次切换状态
      const entered = new Set<string>();
      const exited = new Set<string>();
      scene.triggers.forEach((trigger, j) => {
        if (typeof trigger.sound === "string" && !isSoundId(trigger.sound)) {
          issue(
            at("triggers", j, "sound"),
            `音效 ${trigger.sound} 没有登记，登记过的音效：${Object.keys(SOUNDS).join("、")}`,
          );
        }
        const used = scene.components.find((c) => c.id === trigger.target);
        if (!used) {
          issue(at("triggers", j, "target"), `本画面没有组件 ${trigger.target}`);
        } else if (trigger.action === "enter") {
          if (entered.has(used.id)) {
            issue(at("triggers", j), `组件 ${used.id} 已经有 enter 触发`);
          }
          entered.add(used.id);
        } else if (trigger.action === "exit") {
          if (exited.has(used.id)) {
            issue(at("triggers", j), `组件 ${used.id} 已经有 exit 触发`);
          }
          exited.add(used.id);
        } else {
          const states = declarationOf(components, used.component)?.states;
          if (states && !states.includes(trigger.state)) {
            issue(
              at("triggers", j, "state"),
              `组件 ${used.id}（${used.component}）没有状态 ${trigger.state}，声明过的状态：${states.join("、")}`,
            );
          }
        }
        const line = lines.get(trigger.line);
        if (!line) {
          issue(at("triggers", j, "line"), `旁白句 ${trigger.line} 不存在`);
        } else if (line.scene !== scene.scene) {
          issue(
            at("triggers", j, "line"),
            `旁白句 ${trigger.line} 不属于画面 ${scene.scene}（属于 ${line.scene}）`,
          );
        }
      });
      scene.components.forEach((used, j) => {
        if (!entered.has(used.id)) {
          issue(at("components", j), `组件 ${used.id} 没有 enter 触发`);
        }
      });
    });

    if (!isMusicId(storyboard.music)) {
      issue(
        ["music"],
        `配乐 ${storyboard.music} 没有登记，登记过的配乐：${Object.keys(MUSIC).join("、")}`,
      );
    }

    const paused = new Set<string>();
    storyboard.pauses.forEach((pause, i) => {
      const at = ["pauses", i, "after"];
      if (!lines.has(pause.after)) {
        issue(at, `旁白句 ${pause.after} 不存在`);
      } else if (pause.after === lastLine) {
        issue(at, `${pause.after} 是最后一句，之后没有停顿`);
      } else if (paused.has(pause.after)) {
        issue(at, `${pause.after} 之后的停顿已经覆盖过`);
      }
      paused.add(pause.after);
    });
  });
};

const ORDINALS: Record<string, string> = {
  scenes: "画面",
  components: "组件",
  triggers: "触发",
  pauses: "停顿覆盖",
};

// ["scenes", 1, "triggers", 0, "line"] → "第 2 个画面 第 1 个触发 line"
const describePath = (path: PropertyKey[]) =>
  path
    .map((key, i) => {
      if (typeof key === "number") {
        const kind = ORDINALS[String(path[i - 1])];
        return kind ? `第 ${key + 1} 个${kind}` : `[${key}]`;
      }
      return ORDINALS[String(key)] && typeof path[i + 1] === "number"
        ? null
        : String(key);
    })
    .filter((part) => part !== null)
    .join(" ");

/**
 * 校验分镜，并和合成清单、组件注册表交叉核对；
 * 不合格时报错，每个问题写明是第几个画面、第几个触发。
 */
export const parseStoryboard = (
  data: unknown,
  manifest: EpisodeManifest,
  components: ComponentDeclarations,
): Storyboard => {
  const result = storyboardSchema(manifest, components).safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  ${describePath(issue.path)}: ${issue.message}`,
    );
    throw new Error(`分镜格式不对：\n${issues.join("\n")}`);
  }
  return result.data;
};

/** 分镜里的停顿覆盖，交给 `computeTimeline` */
export const pauseOverrides = (storyboard: Storyboard): PauseOverrides =>
  Object.fromEntries(storyboard.pauses.map((pause) => [pause.after, pause.seconds]));

/** 网格上的一块：左上角所在的格 `at`，占几格 `cells` */
export type Area = { at: Cells; cells: Cells };

/** 一个组件在本画面里的排期 */
export type Cue = {
  /** `<画面 ID>/<组件 id>`，在整期里唯一 */
  key: string;
  component: string;
  props: Record<string, unknown>;
  /** `sound`：这个动作要放的音效，null 表示不放（见 `soundCues`） */
  enter: { frame: number; animation: Animation; sound: Sound };
  /** 没有退场时为 null：显示到画面结束 */
  exit: { frame: number; animation: Animation; sound: Sound } | null;
  /** 入场时的状态：组件声明的第一个状态（入场时不响它的音效） */
  initialState: string;
  /** 各次切换状态，按帧排序 */
  states: { frame: number; state: string; sound: Sound }[];
  /** 在网格上占的格：左上角 `at` 和占几格 `cells`；连线类组件为 null */
  area: Area | null;
  /** 连线类组件（箭头）两端组件占的格：起点 `from`、终点 `to`；其余组件为 null */
  ends: { from: Area; to: Area } | null;
} & FrameSpan /* 从入场帧到退场动画结束（没有退场时到画面结束） */;

/**
 * 按时间轴排出每个组件的入场、退场和切换状态的帧，以及它在画面上的区间。
 * 触发帧 = 旁白句开始帧 + 偏移秒数 × 帧率，四舍五入到整帧；
 * 落在所在画面之外、帧顺序不是「入场 ≤ 切换状态 < 退场」、同一帧切两次状态、
 * 切到当前已经是的状态、退场动画在画面结束前播不完时报错，不悄悄截断；
 * 同一画面里同时在画面上的两个组件格子重叠时也报错（子组件和父组件除外）；
 * 箭头的区间超出两端组件、子组件的格子或区间超出父组件、子组件压住父组件的标签时报错。
 * `storyboard` 须已经过 `parseStoryboard` 和同一份合成清单、同一份组件声明核对。
 */
export const scheduleCues = (
  storyboard: Storyboard,
  timeline: Timeline,
  components: ComponentDeclarations,
): Cue[] =>
  storyboard.scenes.flatMap((scene, i) => {
    const span = timeline.scenes.find((s) => s.id === scene.scene)!;
    const where = (j: number) => `分镜第 ${i + 1} 个画面 第 ${j + 1} 个触发`;
    const frames = scene.triggers.map((trigger, j) => {
      const line = timeline.lines.find((l) => l.id === trigger.line)!;
      const frame = Math.round(line.startFrame + trigger.offset * timeline.fps);
      const reason = `（${trigger.line} 偏移 ${trigger.offset} 秒）`;
      if (frame < span.startFrame) {
        throw new Error(
          `${where(j)}: 触发帧 ${frame} 早于画面 ${scene.scene} 的开始帧 ${span.startFrame}${reason}`,
        );
      }
      if (frame >= span.endFrame) {
        throw new Error(
          `${where(j)}: 触发帧 ${frame} 不早于画面 ${scene.scene} 的结束帧 ${span.endFrame}${reason}`,
        );
      }
      return frame;
    });

    const cues = scene.components.map((used): Cue => {
      const declared = components[used.component]!;
      const mine = scene.triggers
        .map((trigger, j) => ({ trigger, j, frame: frames[j]! }))
        .filter(({ trigger }) => trigger.target === used.id);
      const enter = mine.find(({ trigger }) => trigger.action === "enter")!;
      const exit = mine.find(({ trigger }) => trigger.action === "exit");
      const states = mine
        .flatMap(({ trigger, j, frame }) =>
          trigger.action === "state"
            ? [{ j, frame, state: trigger.state, sound: trigger.sound }]
            : [],
        )
        .sort((a, b) => a.frame - b.frame);
      if (exit && exit.frame <= enter.frame) {
        throw new Error(
          `${where(exit.j)}: 退场帧 ${exit.frame} 不晚于组件 ${used.id} 的入场帧 ${enter.frame}`,
        );
      }
      let current = declared.states[0];
      let previous: { j: number; frame: number } | undefined;
      for (const { j, frame, state } of states) {
        if (frame < enter.frame) {
          throw new Error(
            `${where(j)}: 切换状态的帧 ${frame} 早于组件 ${used.id} 的入场帧 ${enter.frame}`,
          );
        }
        if (exit && frame >= exit.frame) {
          throw new Error(
            `${where(j)}: 切换状态的帧 ${frame} 不早于组件 ${used.id} 的退场帧 ${exit.frame}`,
          );
        }
        if (previous?.frame === frame) {
          throw new Error(
            `${where(j)}: 组件 ${used.id} 在第 ${frame} 帧已经切换过状态（第 ${previous.j + 1} 个触发）`,
          );
        }
        if (state === current) {
          throw new Error(`${where(j)}: 组件 ${used.id} 这时已经是状态 ${state}`);
        }
        current = state;
        previous = { j, frame };
      }
      const exitAnimation =
        exit?.trigger.action === "exit"
          ? (exit.trigger.animation ?? declared.exit)
          : declared.exit;
      const exitEnd = exit
        ? exit.frame + animationFrames(exitAnimation, timeline.fps)
        : span.endFrame;
      if (exit && exitEnd > span.endFrame) {
        throw new Error(
          `${where(exit.j)}: 组件 ${used.id} 的退场动画 ${exitAnimation} 到第 ${exitEnd} 帧才播完，晚于画面 ${scene.scene} 的结束帧 ${span.endFrame}`,
        );
      }
      const enterAnimation =
        (enter.trigger.action === "enter" && enter.trigger.animation) ||
        declared.enter;
      // 触发上写了 sound 就用它（null 是不放），否则用声明的默认音效；`none` 动画不放音效
      const soundOf = (
        { trigger, j }: { trigger: { sound?: string | null }; j: number },
        fallback: Sound,
        animation?: Animation,
      ): Sound => {
        if (animation === "none") {
          if (typeof trigger.sound === "string") {
            throw new Error(`${where(j)}: 动画 none 不放音效，去掉 sound`);
          }
          return null;
        }
        return trigger.sound === undefined ? fallback : (trigger.sound as SoundId | null);
      };
      return {
        key: `${scene.scene}/${used.id}`,
        component: used.component,
        props: used.props,
        enter: {
          frame: enter.frame,
          animation: enterAnimation,
          sound: soundOf(enter, declared.sounds.enter, enterAnimation),
        },
        exit: exit
          ? {
              frame: exit.frame,
              animation: exitAnimation,
              sound: soundOf(exit, declared.sounds.exit, exitAnimation),
            }
          : null,
        initialState: declared.states[0],
        states: states.map((switched) => ({
          frame: switched.frame,
          state: switched.state,
          sound: soundOf(
            { trigger: switched, j: switched.j },
            declared.sounds.states[switched.state] ?? null,
          ),
        })),
        area: used.at
          ? { at: used.at, cells: declared.cells(declared.props.parse(used.props)) }
          : null,
        ends: null,
        startFrame: enter.frame,
        endFrame: exitEnd,
      };
    });
    const inScene = `分镜第 ${i + 1} 个画面`;
    const linked = linkEnds(scene, cues, inScene);
    rejectStrayChildren(scene, linked, components, inScene);
    rejectOverlaps(linked, scene.components, inScene);
    return linked;
  });

const spanText = ({ startFrame, endFrame }: FrameSpan) =>
  `第 ${startFrame} 帧到第 ${endFrame} 帧`;

/** `inner` 的帧区间完全落在 `outer` 里（同一帧入场、同一帧离开画面都算） */
const spanWithin = (inner: FrameSpan, outer: FrameSpan) =>
  inner.startFrame >= outer.startFrame && inner.endFrame <= outer.endFrame;

/**
 * 给连线类组件（箭头）填上两端组件占的格 `ends`；箭头在画面上的区间
 * 必须完全落在两端组件的区间里，否则报错。端点已由 `parseStoryboard` 核对过。
 */
const linkEnds = (
  scene: Storyboard["scenes"][number],
  cues: Cue[],
  where: string,
): Cue[] => {
  const cueOf = (id: string) => cues[scene.components.findIndex((c) => c.id === id)]!;
  return cues.map((cue, j) => {
    const used = scene.components[j]!;
    if (used.from === undefined || used.to === undefined) return cue;
    const ends = { from: cueOf(used.from), to: cueOf(used.to) };
    (["from", "to"] as const).forEach((end) => {
      const other = ends[end];
      if (!spanWithin(cue, other)) {
        throw new Error(
          `${where} 第 ${j + 1} 个组件 ${used.id}: 箭头从${spanText(cue)}（不含）在画面上，超出${end === "from" ? "起点" : "终点"} ${used[end]} 的${spanText(other)}（不含）`,
        );
      }
    });
    return { ...cue, ends: { from: ends.from.area!, to: ends.to.area! } };
  });
};

/**
 * 排期里要放的音效，按帧排序（同一帧的按分镜里的先后）：入场、切换状态、退场各自的音效。
 * 同一帧的同一个音效只放一次（几个方块同时入场时不会叠得更响）；
 * Remotion 渲染时本来也会把同一帧、同一文件的音频当成同一个合并掉，这里明确写出来，
 * Studio 预览和成片才一致。
 */
export const soundCues = (cues: Cue[]): SoundCue[] => {
  const seen = new Set<string>();
  return cues
    .flatMap((cue) => [cue.enter, ...cue.states, ...(cue.exit ? [cue.exit] : [])])
    .flatMap(({ frame, sound }) => (sound ? [{ frame, sound }] : []))
    .sort((a, b) => a.frame - b.frame)
    .filter(({ frame, sound }) => {
      const key = `${frame} ${sound}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/**
 * 同一时间都在画面上（帧区间 `[startFrame, endFrame)` 相交，含退场动画）的两个组件，
 * 占的格子重叠时报错。连线类组件不占格子，不参加；子组件和它的父组件（及更上层）不算重叠
 * （子组件落在父组件里由 `rejectStrayChildren` 保证）。
 */
const rejectOverlaps = (
  cues: Cue[],
  used: Storyboard["scenes"][number]["components"],
  where: string,
) => {
  const ids = used.map((c) => c.id);
  cues.forEach((later, k) => {
    cues.slice(0, k).forEach((earlier, j) => {
      const [mine, theirs] = [later.area, earlier.area];
      if (!mine || !theirs) return;
      if (isAncestor(used, ids[j]!, ids[k]!) || isAncestor(used, ids[k]!, ids[j]!)) return;
      const from = Math.max(later.startFrame, earlier.startFrame);
      const until = Math.min(later.endFrame, earlier.endFrame);
      if (from >= until) return;
      const cell = ([0, 1] as const).map((axis) => {
        const start = Math.max(mine.at[axis], theirs.at[axis]);
        const end = Math.min(
          mine.at[axis] + mine.cells[axis],
          theirs.at[axis] + theirs.cells[axis],
        );
        return start < end ? start : null;
      });
      if (cell[0] === null || cell[1] === null) return;
      const name = (n: number) => `第 ${n + 1} 个组件 ${ids[n]}`;
      throw new Error(
        `${where}: ${name(k)} 和${name(j)} 的格子重叠（格 [${cell[0]}, ${cell[1]}]），从第 ${from} 帧到第 ${until} 帧（不含）同时在画面上`,
      );
    });
  });
};

/** `ancestor` 是不是 `id` 的父组件，或父组件的父组件……（`parseStoryboard` 已排除了环） */
const isAncestor = (
  used: Storyboard["scenes"][number]["components"],
  ancestor: string,
  id: string,
): boolean => {
  const parent = used.find((c) => c.id === id)?.parent;
  return parent !== undefined && (parent === ancestor || isAncestor(used, ancestor, parent));
};

/** `inner` 的格子完全落在 `outer` 里 */
const areaWithin = (inner: Area, outer: Area) =>
  ([0, 1] as const).every(
    (axis) =>
      inner.at[axis] >= outer.at[axis] &&
      inner.at[axis] + inner.cells[axis] <= outer.at[axis] + outer.cells[axis],
  );

/** 两块格子有没有公共的格 */
const areasMeet = (a: Area, b: Area) =>
  ([0, 1] as const).every(
    (axis) =>
      Math.max(a.at[axis], b.at[axis]) <
      Math.min(a.at[axis] + a.cells[axis], b.at[axis] + b.cells[axis]),
  );

const areaText = ({ at, cells }: Area) => `从 [${at[0]}, ${at[1]}] 起的 ${cells[0]}×${cells[1]} 格`;

/**
 * 子组件（写了 `parent` 的）的格子和区间都必须完全落在父组件里，
 * 也不能压住父组件的标签（父组件声明的 `labelArea`）；任一条不满足都报错。
 */
const rejectStrayChildren = (
  scene: Storyboard["scenes"][number],
  cues: Cue[],
  components: ComponentDeclarations,
  where: string,
) => {
  scene.components.forEach((used, j) => {
    if (used.parent === undefined) return;
    const k = scene.components.findIndex((c) => c.id === used.parent);
    const [child, parent] = [cues[j]!, cues[k]!];
    const name = `${where} 第 ${j + 1} 个组件 ${used.id}`;
    const parentName = `父组件 ${used.parent}`;
    if (!areaWithin(child.area!, parent.area!)) {
      throw new Error(
        `${name}: 占${areaText(child.area!)}，超出${parentName}${areaText(parent.area!)}`,
      );
    }
    const declared = components[parent.component]!;
    const label = declared.labelArea?.(declared.props.parse(parent.props));
    if (label) {
      const onScreen = {
        at: [parent.area!.at[0] + label.at[0], parent.area!.at[1] + label.at[1]] as const,
        cells: label.cells,
      };
      if (areasMeet(child.area!, onScreen)) {
        throw new Error(
          `${name}: 压住了${parentName}的标签（标签占${areaText(onScreen)}），换到父组件标签以外的格子`,
        );
      }
    }
    if (!spanWithin(child, parent)) {
      throw new Error(
        `${name}: 从${spanText(child)}（不含）在画面上，超出${parentName}的${spanText(parent)}（不含）`,
      );
    }
  });
};
