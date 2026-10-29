// 组件样张（#35）：每个组件一份假分镜，把它的每个状态、每种入场和退场动画都演一遍。
// Studio 里每个组件一页（合成 ID `Sample-<组件名>`，见 Root.tsx），字幕位置写着这一刻在演什么。
// 样张走和成片一样的 `planEpisode`，所以分镜检查管得到的，样张也管得到。
// 纯 .ts、不引用 React/remotion：注册表一致性测试在 Node 里检查每个组件都有样张、都演全了。
import { type EpisodePlan, planEpisode } from "../episode/episode-plan";
import type { EpisodeManifest } from "../episode/manifest";
import type { Storyboard } from "../episode/storyboard";
import { BLOCK_COLORS } from "../style/style";
import { COMPONENT_DECLARATIONS } from "./declarations";

type StoryboardScene = Storyboard["scenes"][number];
type StoryboardTrigger = StoryboardScene["triggers"][number];
/** 分镜的触发，只是 `line` 写成样张里的句序号 */
type SampleTrigger = StoryboardTrigger extends infer T
  ? T extends StoryboardTrigger
    ? Omit<T, "line"> & { line: number }
    : never
  : never;

/** 样张里的一个画面：画面说明、几句说明文字（显示在字幕位置）、组件和触发 */
type SampleScene = {
  description: string;
  /** 每句的说明文字和停留的秒数；触发按 `l<序号>`（整份样张里从 1 数起）引用 */
  lines: { text: string; seconds: number }[];
  components: StoryboardScene["components"];
  triggers: SampleTrigger[];
};

export type ComponentSample = {
  /** 显示在左上角主题的位置 */
  title: string;
  scenes: SampleScene[];
};

export type ComponentName = keyof typeof COMPONENT_DECLARATIONS;

const sceneId = (i: number) => `s01-c${String(i + 1).padStart(2, "0")}`;
const lineId = (n: number) => `s01-l${String(n).padStart(2, "0")}`;

/** 把样张写成合成清单和分镜（假的：没有音频，只用来排期） */
export const sampleEpisode = (
  sample: ComponentSample,
): { manifest: EpisodeManifest; storyboard: Storyboard } => {
  let count = 0;
  const lines = sample.scenes.flatMap((scene, i) =>
    scene.lines.map((line) => ({
      id: lineId(++count),
      scene: sceneId(i),
      text: line.text,
      audio: "",
      seconds: line.seconds,
    })),
  );
  return {
    manifest: {
      voice_fingerprint: "0000000000000000",
      title: sample.title,
      segments: [{ id: "s01", title: sample.title }],
      scenes: sample.scenes.map((scene, i) => ({
        id: sceneId(i),
        segment: "s01",
        description: scene.description,
      })),
      lines,
    },
    storyboard: {
      scenes: sample.scenes.map((scene, i) => ({
        scene: sceneId(i),
        components: scene.components,
        triggers: scene.triggers.map(
          (trigger) =>
            ({ ...trigger, line: lineId(trigger.line) }) as StoryboardTrigger,
        ),
      })),
      // 分镜必须写配乐；样张页（ComponentSample）只放音效，不放配乐
      music: "pixel-sprinter",
      pauses: [],
    },
  };
};

const BLOCK_COLOR_NAMES = Object.keys(BLOCK_COLORS);

/** 箭头样张里的知识块：箭头的两端 */
const block = (id: string, label: string, at: [number, number], size = "small") => ({
  id,
  component: "PixelBlock",
  props: { label, size, color: "orange" },
  at,
});

/** 组件名 → 样张；少一个组件，类型检查会报错 */
export const COMPONENT_SAMPLES: Record<ComponentName, ComponentSample> = {
  PixelBlock: {
    title: "样张：知识块 PixelBlock",
    scenes: [
      {
        description: "三个知识块 fade、slide、none 依次入场，再依次退场",
        lines: [
          { text: "入场：fade slide none", seconds: 2.5 },
          { text: "退场：fade slide none", seconds: 2.5 },
        ],
        components: [
          { id: "a", component: "PixelBlock", props: { label: "fade", size: "small", color: "blue" }, at: [0, 1] },
          { id: "b", component: "PixelBlock", props: { label: "slide", size: "medium", color: "orange" }, at: [3, 1] },
          { id: "c", component: "PixelBlock", props: { label: "none", size: "large", color: "green" }, at: [7, 1] },
        ],
        triggers: [
          { target: "a", line: 1, offset: 0, action: "enter", animation: "fade" },
          { target: "b", line: 1, offset: 0.6, action: "enter", animation: "slide" },
          { target: "c", line: 1, offset: 1.2, action: "enter", animation: "none" },
          { target: "a", line: 2, offset: 0, action: "exit", animation: "fade" },
          { target: "b", line: 2, offset: 0.6, action: "exit", animation: "slide" },
          { target: "c", line: 2, offset: 1.2, action: "exit", animation: "none" },
        ],
      },
      {
        description: `六种颜色：${BLOCK_COLOR_NAMES.join("、")}`,
        lines: [{ text: "六种颜色（默认入场 slide）", seconds: 2 }],
        components: BLOCK_COLOR_NAMES.map((color, i) => ({
          id: color,
          component: "PixelBlock",
          props: { label: color, size: "small", color },
          at: [i * 2, 2] as [number, number],
        })),
        triggers: BLOCK_COLOR_NAMES.map((color) => ({
          target: color,
          line: 3,
          offset: 0,
          action: "enter" as const,
        })),
      },
      {
        description: "知识块 DRY 入场，切到高亮，再切到已改，切回正常，然后退场",
        lines: [
          { text: "入场：正常 normal（音效 drop）", seconds: 1.5 },
          { text: "切到高亮 highlight（blip）", seconds: 1.5 },
          { text: "切到已改 changed（buzz）", seconds: 1.5 },
          { text: "切回正常 normal（blip）", seconds: 1.5 },
          { text: "退场：默认 fade（leave）", seconds: 1.5 },
        ],
        components: [
          { id: "dry", component: "PixelBlock", props: { label: "DRY", size: "large", color: "orange" }, at: [4, 1] },
        ],
        triggers: [
          { target: "dry", line: 4, offset: 0, action: "enter" },
          { target: "dry", line: 5, offset: 0, action: "state", state: "highlight" },
          { target: "dry", line: 6, offset: 0, action: "state", state: "changed" },
          { target: "dry", line: 7, offset: 0, action: "state", state: "normal" },
          { target: "dry", line: 8, offset: 0, action: "exit" },
        ],
      },
      {
        description: "嵌套：小方块复制粘贴源码嵌在大方块知识和意图的左上角，标签在中间一行，子组件只能放在上下两行",
        lines: [
          { text: "大方块入场", seconds: 1.5 },
          { text: "小方块嵌在左上角（parent）", seconds: 2 },
        ],
        components: [
          { id: "intent", component: "PixelBlock", props: { label: "知识和意图", size: "large", color: "orange" }, at: [4, 1] },
          { id: "copy", component: "PixelBlock", props: { label: "复制粘贴源码", size: "small", color: "cream" }, at: [4, 1], parent: "intent" },
        ],
        triggers: [
          { target: "intent", line: 9, offset: 0, action: "enter" },
          { target: "copy", line: 10, offset: 0, action: "enter" },
        ],
      },
    ],
  },
  Mascot: {
    title: "样张：小人 Mascot",
    scenes: [
      {
        description: "四个小人 dragon、reader、whale、gothic 依次入场，再依次退场",
        lines: [
          { text: "入场：fade slide none 默认", seconds: 2.5 },
          { text: "退场：fade slide none 默认", seconds: 2.5 },
        ],
        components: (["dragon", "reader", "whale", "gothic"] as const).map(
          (character, i) => ({
            id: character,
            component: "Mascot",
            props: { character },
            at: [i * 3, 0] as [number, number],
          }),
        ),
        triggers: (
          [
            ["dragon", "fade"],
            ["reader", "slide"],
            ["whale", "none"],
            ["gothic", undefined],
          ] as const
        ).flatMap(([target, animation], i) =>
          (["enter", "exit"] as const).map((action) => ({
            target,
            line: action === "enter" ? 1 : 2,
            offset: i * 0.4,
            action,
            ...(animation ? { animation } : {}),
          })),
        ),
      },
      {
        description:
          "一个小人冒问号、换成感叹号、符号消失；三个并排的小人一起冒问号；五个挤成一群的小人一起冒感叹号",
        lines: [
          { text: "一个小人：默认 fade 入场（pop）", seconds: 1.5 },
          { text: "头顶冒问号 question（blip）", seconds: 2 },
          { text: "换成感叹号 exclaim（ding）", seconds: 2 },
          { text: "切回正常 normal：符号淡出（不放音效）", seconds: 1.5 },
          { text: "三人一排 row，五人一群 crowd 入场", seconds: 1.5 },
          { text: "一排一起冒问号，一群一起冒感叹号", seconds: 2.5 },
          { text: "退场：默认 fade（leave）", seconds: 1.5 },
        ],
        components: [
          { id: "one", component: "Mascot", props: { character: "reader" }, at: [5, 0] },
          {
            id: "row",
            component: "Mascot",
            props: { character: ["dragon", "reader", "whale"], count: 3 },
            at: [0, 3],
          },
          {
            id: "crowd",
            component: "Mascot",
            props: {
              character: ["dragon", "reader", "whale", "gothic"],
              count: 5,
              formation: "crowd",
            },
            at: [6, 2],
          },
        ],
        triggers: [
          { target: "one", line: 3, offset: 0, action: "enter" },
          { target: "one", line: 4, offset: 0, action: "state", state: "question" },
          { target: "one", line: 5, offset: 0, action: "state", state: "exclaim" },
          { target: "one", line: 6, offset: 0, action: "state", state: "normal" },
          { target: "one", line: 6, offset: 1, action: "exit" },
          { target: "row", line: 7, offset: 0, action: "enter" },
          { target: "crowd", line: 7, offset: 0.4, action: "enter" },
          { target: "row", line: 8, offset: 0, action: "state", state: "question" },
          { target: "crowd", line: 8, offset: 0.6, action: "state", state: "exclaim" },
          { target: "row", line: 9, offset: 0, action: "exit" },
          { target: "crowd", line: 9, offset: 0, action: "exit" },
        ],
      },
    ],
  },
  Arrow: {
    title: "样张：箭头 Arrow",
    scenes: [
      {
        description: "知识块 DRY 指向知识块 ETC：箭头入场，高亮，切回正常，退场",
        lines: [
          { text: "两个知识块落下", seconds: 1.5 },
          { text: "箭头入场：默认 fade（pop）", seconds: 1.5 },
          { text: "切到高亮 highlight（blip）", seconds: 1.5 },
          { text: "切回正常 normal（blip）", seconds: 1.5 },
          { text: "退场：默认 fade（leave）", seconds: 1.5 },
        ],
        components: [
          block("dry", "DRY", [0, 1], "medium"),
          block("etc", "ETC", [8, 3], "medium"),
          { id: "arrow", component: "Arrow", props: {}, from: "dry", to: "etc" },
        ],
        triggers: [
          { target: "dry", line: 1, offset: 0, action: "enter" },
          { target: "etc", line: 1, offset: 0, action: "enter" },
          { target: "arrow", line: 2, offset: 0, action: "enter" },
          { target: "arrow", line: 3, offset: 0, action: "state", state: "highlight" },
          { target: "arrow", line: 4, offset: 0, action: "state", state: "normal" },
          { target: "arrow", line: 5, offset: 0, action: "exit" },
        ],
      },
      {
        description: "改一处要连带改三处：代码指向文档、数据库 Schema、测试，三个箭头 slide、none、fade 依次入场，再依次退场",
        lines: [
          { text: "入场：slide none fade", seconds: 2.5 },
          { text: "退场：slide none fade", seconds: 2.5 },
        ],
        components: [
          block("code", "代码", [1, 2], "medium"),
          block("docs", "文档", [9, 0]),
          block("schema", "数据库 Schema", [8, 2], "medium"),
          block("tests", "测试", [9, 5]),
          ...(["docs", "schema", "tests"] as const).map((to) => ({
            id: `to-${to}`,
            component: "Arrow",
            props: {},
            from: "code",
            to,
          })),
        ],
        triggers: [
          ...(["code", "docs", "schema", "tests"] as const).map((target) => ({
            target,
            line: 6,
            offset: 0,
            action: "enter" as const,
            sound: target === "code" ? undefined : null,
          })),
          ...(
            [
              ["to-docs", "slide"],
              ["to-schema", "none"],
              ["to-tests", "fade"],
            ] as const
          ).flatMap(([target, animation], i) =>
            (["enter", "exit"] as const).map((action) => ({
              target,
              line: action === "enter" ? 6 : 7,
              offset: (action === "enter" ? 0.6 : 0) + i * 0.6,
              action,
              animation,
            })),
          ),
        ],
      },
    ],
  },
  HintSign: {
    title: "样张：提示牌 HintSign",
    scenes: [
      {
        description: "提示14 的标题牌亮起：ETC，停一下，再熄灭",
        lines: [
          { text: "入场：默认亮起 light（ding）", seconds: 2 },
          { text: "亮着：正常 normal", seconds: 1.5 },
          { text: "退场：light 倒着播，熄灭（leave）", seconds: 2 },
        ],
        components: [
          { id: "tip", component: "HintSign", props: { label: "提示", number: "14", title: "ETC" }, at: [3, 1] },
        ],
        triggers: [
          { target: "tip", line: 1, offset: 0, action: "enter" },
          { target: "tip", line: 3, offset: 0, action: "exit", animation: "light" },
        ],
      },
      {
        description: "三块提示牌：提示15 DRY、提示16 复用、提示17 正交性，依次 fade、slide、none 入场，再依次退场",
        lines: [
          { text: "入场：fade slide none", seconds: 2.5 },
          { text: "退场：fade slide none", seconds: 2.5 },
        ],
        components: (
          [
            ["dry", "15", "DRY", [0, 0]],
            ["reuse", "16", "复用", [6, 0]],
            ["orthogonal", "17", "正交性", [3, 3]],
          ] as const
        ).map(([id, number, title, at]) => ({
          id,
          component: "HintSign",
          props: { label: "提示", number, title },
          at: [...at] as [number, number],
        })),
        triggers: (
          [
            ["dry", "fade"],
            ["reuse", "slide"],
            ["orthogonal", "none"],
          ] as const
        ).flatMap(([target, animation], i) =>
          (["enter", "exit"] as const).map((action) => ({
            target,
            line: action === "enter" ? 4 : 5,
            offset: i * 0.6,
            action,
            animation,
          })),
        ),
      },
    ],
  },
  Computer: {
    title: "样张：电脑 Computer",
    scenes: [
      {
        description: "电脑屏幕上写着两条矛盾的知识，电脑崩溃，再重启回正常，然后退场",
        lines: [
          { text: "入场：正常 normal，默认 fade（pop）", seconds: 2 },
          { text: "切到崩溃 crashed（crash）", seconds: 2.5 },
          { text: "切回正常 normal（blip）", seconds: 1.5 },
          { text: "退场：默认 fade（leave）", seconds: 1.5 },
        ],
        components: [
          { id: "computer", component: "Computer", props: { screen: ["两条", "矛盾的知识"] }, at: [4, 1] },
        ],
        triggers: [
          { target: "computer", line: 1, offset: 0, action: "enter" },
          { target: "computer", line: 2, offset: 0, action: "state", state: "crashed" },
          { target: "computer", line: 3, offset: 0, action: "state", state: "normal" },
          { target: "computer", line: 4, offset: 0, action: "exit" },
        ],
      },
      {
        description: "三台电脑 fade、slide、none 依次入场，再依次退场；最后一台屏幕上没有字",
        lines: [
          { text: "入场：fade slide none", seconds: 2.5 },
          { text: "退场：fade slide none", seconds: 2.5 },
        ],
        components: (
          [
            ["fade", ["fade"], [0, 1]],
            ["slide", ["slide"], [4, 1]],
            ["none", [], [8, 1]],
          ] as const
        ).map(([id, screen, at]) => ({
          id,
          component: "Computer",
          props: { screen: [...screen] },
          at: [...at] as [number, number],
        })),
        triggers: (["fade", "slide", "none"] as const).flatMap((animation, i) =>
          (["enter", "exit"] as const).map((action) => ({
            target: animation,
            line: action === "enter" ? 5 : 6,
            offset: i * 0.6,
            action,
            animation,
          })),
        ),
      },
    ],
  },
  Fork: {
    title: "样张：岔路 Fork",
    scenes: [
      {
        description:
          "岔路：四条路 好改、难改、看不出、近路，逐条标出，再逐条放上路障，撤掉路障，然后退场",
        lines: [
          { text: "入场：正常 normal，默认 fade（pop）", seconds: 1.5 },
          ...[1, 2, 3, 4].map((road) => ({
            text: `标出第 ${road} 条路 mark-${road}（blip）`,
            seconds: 1,
          })),
          ...[1, 2, 3, 4].map((road) => ({
            text: `路障放到第 ${road} 条路 block-${road}（drop）`,
            seconds: 1.2,
          })),
          { text: "撤掉路障：切回正常 normal（blip）", seconds: 1.5 },
          { text: "退场：默认 fade（leave）", seconds: 1.5 },
        ],
        components: [
          {
            id: "fork",
            component: "Fork",
            props: { roads: 4, labels: ["好改", "难改", "看不出", "近路"] },
            at: [3, 1],
          },
        ],
        triggers: [
          { target: "fork", line: 1, offset: 0, action: "enter" },
          ...(["mark", "block"] as const).flatMap((kind, k) =>
            [1, 2, 3, 4].map((road) => ({
              target: "fork",
              line: 2 + k * 4 + (road - 1),
              offset: 0,
              action: "state" as const,
              state: `${kind}-${road}`,
            })),
          ),
          { target: "fork", line: 10, offset: 0, action: "state", state: "normal" },
          { target: "fork", line: 11, offset: 0, action: "exit" },
        ],
      },
      {
        description: "两条路、三条路的岔路 fade、slide 入场，退场后再来一个 none，路上不写字",
        lines: [
          { text: "入场：fade slide", seconds: 2 },
          { text: "退场：fade slide", seconds: 2 },
          { text: "入场和退场：none", seconds: 2 },
        ],
        components: [
          { id: "fade", component: "Fork", props: { roads: 2 }, at: [0, 1] },
          { id: "slide", component: "Fork", props: { roads: 3 }, at: [6, 1] },
          { id: "none", component: "Fork", props: { roads: 3 }, at: [3, 1] },
        ],
        triggers: [
          ...(["fade", "slide"] as const).flatMap((animation, i) =>
            (["enter", "exit"] as const).map((action) => ({
              target: animation,
              line: action === "enter" ? 12 : 13,
              offset: i * 0.6,
              action,
              animation,
            })),
          ),
          { target: "none", line: 14, offset: 0, action: "enter", animation: "none" },
          { target: "none", line: 14, offset: 1.5, action: "exit", animation: "none" },
        ],
      },
    ],
  },
  Timeline: {
    title: "样张：时间线 Timeline",
    scenes: [
      {
        description:
          "时间线：起点、需求、设计、编码、发布、维护，逐个点亮，全部熄灭，再一口气点亮，然后退场",
        lines: [
          { text: "入场：正常 normal，默认 fade（pop）", seconds: 1.5 },
          ...[1, 2, 3, 4, 5, 6].map((n) => ({
            text: `点亮到第 ${n} 个 lit-${n}（ding）`,
            seconds: 1,
          })),
          { text: "全部熄灭：切回正常 normal（不放音效）", seconds: 1.5 },
          { text: "一口气点亮到第 6 个 lit-6（ding）", seconds: 3 },
          { text: "退场：默认 fade（leave）", seconds: 1.5 },
        ],
        components: [
          {
            id: "timeline",
            component: "Timeline",
            props: { nodes: ["起点", "需求", "设计", "编码", "发布", "维护"] },
            at: [0, 2],
          },
        ],
        triggers: [
          { target: "timeline", line: 1, offset: 0, action: "enter" },
          ...[1, 2, 3, 4, 5, 6].map((n) => ({
            target: "timeline",
            line: 1 + n,
            offset: 0,
            action: "state" as const,
            state: `lit-${n}`,
          })),
          { target: "timeline", line: 8, offset: 0, action: "state", state: "normal" },
          { target: "timeline", line: 9, offset: 0, action: "state", state: "lit-6" },
          { target: "timeline", line: 10, offset: 0, action: "exit" },
        ],
      },
      {
        description: "三条两个节点的时间线：起点、发布，依次 fade、slide、none 入场，再依次退场",
        lines: [
          { text: "入场：fade slide none", seconds: 2.5 },
          { text: "退场：fade slide none", seconds: 2.5 },
        ],
        components: (
          [
            ["fade", [0, 0]],
            ["slide", [4, 2]],
            ["none", [8, 4]],
          ] as const
        ).map(([id, at]) => ({
          id,
          component: "Timeline",
          props: { nodes: ["起点", "发布"] },
          at: [...at] as [number, number],
        })),
        triggers: (["fade", "slide", "none"] as const).flatMap((animation, i) =>
          (["enter", "exit"] as const).map((action) => ({
            target: animation,
            line: action === "enter" ? 11 : 12,
            offset: i * 0.6,
            action,
            animation,
          })),
        ),
      },
    ],
  },
};

/** 样张的排期（和成片同一个 `planEpisode`） */
export const samplePlan = (name: ComponentName): EpisodePlan => {
  const { manifest, storyboard } = sampleEpisode(COMPONENT_SAMPLES[name]);
  return planEpisode(manifest, storyboard);
};
