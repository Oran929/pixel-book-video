import { z } from "zod";
import type { EpisodeManifest } from "./manifest";
import type { FrameSpan, PauseOverrides, Timeline } from "./timeline";

// 分镜（spec「分镜（JSON）」）：每个画面用哪些组件、哪个旁白句触发什么动画。
// 只引用 ID 和偏移秒数，不写绝对时间（ADR-0003）。
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
      triggers: z.array(
        z.strictObject({
          /** 本画面里组件的 id */
          target: z.string(),
          /** 本画面里的旁白句 ID */
          line: z.string(),
          /** 相对旁白句开始的秒数，可以为负 */
          offset: z.number(),
          /** 动作先只有 enter：从触发帧显示到画面结束 */
          action: z.literal("enter"),
          animation: z.enum(["fade", "slide"]),
        }),
      ),
    }),
  ),
  /** 个别位置的停顿覆盖：`after` 这句之后停顿 `seconds` 秒 */
  pauses: z.array(
    z.strictObject({ after: z.string(), seconds: z.number().min(0) }),
  ),
});

export type Storyboard = z.infer<typeof StoryboardShape>;

/** 组件注册表里每个组件名对应的参数格式 */
export type ComponentSchemas = Readonly<Record<string, z.ZodType>>;

const storyboardSchema = (
  manifest: EpisodeManifest,
  components: ComponentSchemas,
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
        const props = Object.hasOwn(components, used.component)
          ? components[used.component]
          : undefined;
        if (!props) {
          issue(
            at("components", j, "component"),
            `组件 ${used.component} 不在组件注册表里`,
          );
          return;
        }
        const result = props.safeParse(used.props);
        result.error?.issues.forEach((problem) =>
          issue(at("components", j, "props", ...problem.path), problem.message),
        );
      });

      // 动作先只有 enter：每个组件恰好一个
      const entered = new Set<string>();
      scene.triggers.forEach((trigger, j) => {
        if (!ids.has(trigger.target)) {
          issue(at("triggers", j, "target"), `本画面没有组件 ${trigger.target}`);
        } else if (entered.has(trigger.target)) {
          issue(at("triggers", j), `组件 ${trigger.target} 已经有 enter 触发`);
        }
        entered.add(trigger.target);
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
  components: ComponentSchemas,
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

/** 一个组件在画面上出现的区间：从 enter 触发帧到所在画面结束 */
export type Cue = {
  /** `<画面 ID>/<组件 id>`，在整期里唯一 */
  key: string;
  component: string;
  props: Record<string, unknown>;
  animation: Storyboard["scenes"][number]["triggers"][number]["animation"];
} & FrameSpan;

/**
 * 按时间轴算出每个组件出现的帧区间。
 * 触发帧 = 旁白句开始帧 + 偏移秒数 × 帧率，四舍五入到整帧；
 * 落在所在画面之外时报错，不悄悄截断。
 * `storyboard` 须已经过 `parseStoryboard` 和同一份合成清单核对。
 */
export const scheduleCues = (storyboard: Storyboard, timeline: Timeline): Cue[] =>
  storyboard.scenes.flatMap((scene, i) => {
    const span = timeline.scenes.find((s) => s.id === scene.scene)!;
    return scene.triggers.map((trigger, j) => {
      const line = timeline.lines.find((l) => l.id === trigger.line)!;
      const startFrame = Math.round(line.startFrame + trigger.offset * timeline.fps);
      const where = `分镜第 ${i + 1} 个画面 第 ${j + 1} 个触发`;
      if (startFrame < span.startFrame) {
        throw new Error(
          `${where}: 触发帧 ${startFrame} 早于画面 ${scene.scene} 的开始帧 ${span.startFrame}（${trigger.line} 偏移 ${trigger.offset} 秒）`,
        );
      }
      if (startFrame >= span.endFrame) {
        throw new Error(
          `${where}: 触发帧 ${startFrame} 不早于画面 ${scene.scene} 的结束帧 ${span.endFrame}（${trigger.line} 偏移 ${trigger.offset} 秒）`,
        );
      }
      const used = scene.components.find((c) => c.id === trigger.target)!;
      return {
        key: `${scene.scene}/${used.id}`,
        component: used.component,
        props: used.props,
        animation: trigger.animation,
        startFrame,
        endFrame: span.endFrame,
      };
    });
  });
