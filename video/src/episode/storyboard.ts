import { z } from "zod";
import {
  type Animation,
  ANIMATIONS,
  animationFrames,
  type ComponentDeclarations,
} from "../components/declaration";
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
        }),
      ),
      triggers: z.array(TriggerShape),
    }),
  ),
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
      });

      // 每个组件恰好一次入场、最多一次退场、任意次切换状态
      const entered = new Set<string>();
      const exited = new Set<string>();
      scene.triggers.forEach((trigger, j) => {
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

/** 一个组件在本画面里的排期 */
export type Cue = {
  /** `<画面 ID>/<组件 id>`，在整期里唯一 */
  key: string;
  component: string;
  props: Record<string, unknown>;
  enter: { frame: number; animation: Animation };
  /** 没有退场时为 null：显示到画面结束 */
  exit: { frame: number; animation: Animation } | null;
  /** 各次切换状态，按帧排序 */
  states: { frame: number; state: string }[];
} & FrameSpan /* 从入场帧到退场动画结束（没有退场时到画面结束） */;

/**
 * 按时间轴排出每个组件的入场、退场和切换状态的帧，以及它在画面上的区间。
 * 触发帧 = 旁白句开始帧 + 偏移秒数 × 帧率，四舍五入到整帧；
 * 落在所在画面之外、帧顺序不是「入场 ≤ 切换状态 < 退场」、同一帧切两次状态、
 * 切到当前已经是的状态、退场动画在画面结束前播不完时报错，不悄悄截断。
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

    return scene.components.map((used): Cue => {
      const declared = components[used.component]!;
      const mine = scene.triggers
        .map((trigger, j) => ({ trigger, j, frame: frames[j]! }))
        .filter(({ trigger }) => trigger.target === used.id);
      const enter = mine.find(({ trigger }) => trigger.action === "enter")!;
      const exit = mine.find(({ trigger }) => trigger.action === "exit");
      const states = mine
        .flatMap(({ trigger, j, frame }) =>
          trigger.action === "state" ? [{ j, frame, state: trigger.state }] : [],
        )
        .sort((a, b) => a.frame - b.frame);
      if (exit && exit.frame <= enter.frame) {
        throw new Error(
          `${where(exit.j)}: 退场帧 ${exit.frame} 不晚于组件 ${used.id} 的入场帧 ${enter.frame}`,
        );
      }
      let current = declared.states[0];
      let previous: (typeof states)[number] | undefined;
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
        previous = { j, frame, state };
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
      return {
        key: `${scene.scene}/${used.id}`,
        component: used.component,
        props: used.props,
        enter: {
          frame: enter.frame,
          animation:
            (enter.trigger.action === "enter" && enter.trigger.animation) ||
            declared.enter,
        },
        exit: exit ? { frame: exit.frame, animation: exitAnimation } : null,
        states: states.map(({ frame, state }) => ({ frame, state })),
        startFrame: enter.frame,
        endFrame: exitEnd,
      };
    });
  });
