import { z } from "zod";
import type { Sound } from "../sound/sounds";
import {
  ANIMATIONS,
  type ComponentDeclaration,
  type ComponentDeclarations,
  type ComponentDocs,
  displayTextFields,
  isConnector,
} from "./declaration";

// 组件目录（GLOSSARY「组件目录」，#60）：从组件声明生成两层文档，
// 目录页 `index.md`（每个组件一行）和每个组件一页详情 `<组件名>.md`。
// 生成是纯函数；`npm run catalog`（catalog-cli.ts）只负责把结果写进 `CATALOG_DIR`。
// 常驻组件（字幕、主题）和片头片尾不在注册表里，不进目录。

/** 组件目录所在的目录（已提交） */
export const CATALOG_DIR = new URL("../../../docs/reference/components/", import.meta.url);

type JsonSchema = {
  type?: string;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

const TYPE_NAMES: Record<string, string> = {
  string: "字符串",
  integer: "整数",
  number: "数",
  boolean: "真假",
  object: "对象",
};

const code = (value: unknown) => `\`${String(value)}\``;
const list = (values: readonly unknown[]) => values.map(code).join("、");

/** 参数的类型：「字符串」「整数」「字符串数组」，几种之一时用「，或」连起来 */
const typeOf = (schema: JsonSchema): string => {
  if (schema.anyOf) return schema.anyOf.map(typeOf).join("，或");
  if (schema.type === "array") return `${schema.items ? typeOf(schema.items) : ""}数组`;
  return TYPE_NAMES[schema.type ?? ""] ?? schema.type ?? "任意";
};

/** 数值或项数的范围：「2–6」「≥ 1」「≤ 3」；没有限制时是空 */
const bounds = (min: number | undefined, max: number | undefined): string => {
  const upper = max !== undefined && max < Number.MAX_SAFE_INTEGER ? max : undefined;
  if (min !== undefined && upper !== undefined) return `${min}–${upper}`;
  if (min !== undefined) return `≥ ${min}`;
  if (upper !== undefined) return `≤ ${upper}`;
  return "";
};

/** 参数的取值范围，例如「`small`、`medium`」「2–6 项，每项不空」 */
const rangeOf = (schema: JsonSchema): string => {
  if (schema.anyOf) {
    const [first, ...rest] = schema.anyOf.map((option) =>
      option.type === "array" ? `数组${rangeOf(option)}` : rangeOf(option),
    );
    return [first, ...rest].filter(Boolean).join("；");
  }
  if (schema.enum) return list(schema.enum);
  if (schema.type === "string") return schema.minLength ? "不空" : "";
  if (schema.type === "integer" || schema.type === "number") {
    return bounds(schema.minimum, schema.maximum);
  }
  if (schema.type === "array") {
    const { minItems, maxItems } = schema;
    const count =
      minItems !== undefined && maxItems === undefined
        ? `至少 ${minItems} 项`
        : maxItems !== undefined && minItems === undefined
          ? `最多 ${maxItems} 项`
          : bounds(minItems, maxItems) && `${bounds(minItems, maxItems)} 项`;
    const item = schema.items ? rangeOf(schema.items) : "";
    // 数组里套的是选项表时，取值范围写在前面（「`a`、`b`；数组至少 1 项」由上层拼）
    if (schema.items?.enum) return count;
    return [count, item && `每项${item}`].filter(Boolean).join("，");
  }
  return "";
};

const table = (header: string[], rows: string[][]) =>
  [header, header.map(() => "---"), ...rows].map((cells) => `| ${cells.join(" | ")} |`).join("\n");

const soundText = (sound: Sound) => (sound === null ? "不放" : code(sound));

/** 参数表：字段、类型、是否必填、取值范围、是不是显示文字、说明 */
const paramsSection = (declared: ComponentDeclaration, docs: ComponentDocs): string => {
  const schema = z.toJSONSchema(declared.props, { io: "input", unrepresentable: "any" }) as JsonSchema;
  const fields = Object.entries(schema.properties ?? {});
  if (fields.length === 0) return "没有参数，`props` 写 `{}`。";
  const display = new Set(displayTextFields(declared.props));
  const required = new Set(schema.required ?? []);
  const rows = fields.map(([field, fieldSchema]) => [
    code(field),
    typeOf(fieldSchema),
    required.has(field) ? "必填" : "可选",
    rangeOf(fieldSchema) || "—",
    display.has(field) ? "是" : "否",
    (docs.params as Record<string, string>)[field] ?? "",
  ]);
  const parameters = table(["参数", "类型", "必填", "取值范围", "显示文字", "说明"], rows);
  if (display.size === 0) return parameters;
  return `${parameters}\n\n「显示文字」参数的值必须出自本画面的画面说明或旁白句（见 \`docs/reference/storyboard.md\`「显示文字」）；字放不下怎么算见 \`docs/reference/storyboard.md\`「字宽估算」。`;
};

/** 一行 JSON，逗号、冒号后面带空格，对象两侧留空格：和分镜里的写法一样 */
const inlineJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${inlineJson(item)}`);
    return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value);
};

/** 分镜调用示例：组件在分镜里的一项 */
const exampleOf = (name: string, docs: ComponentDocs): string => {
  const { id, props, at, from, to } = docs.example;
  return inlineJson({ id, component: name, props, ...(at ? { at } : {}), ...(from !== undefined ? { from, to } : {}) });
};

const CONNECTOR_CELLS =
  "不占格子，不参加重叠检查：这是连线类组件，不写 `at`、不写 `parent`，`from`、`to` 必须都写，必须是本画面里两个不同的、按格子摆放的组件（不能指向另一个连线类组件），画法按两端组件的位置算。不是连线类组件的写了 `from`、`to` 也报错。";

/** 一个组件的详情页 */
const detailPage = (name: string, declared: ComponentDeclaration): string => {
  const docs = declared.docs;
  if (!docs) throw new Error(`组件 ${name} 的声明没写 docs（组件目录的详情说明）`);
  const [initial] = declared.states;
  const effects = Object.entries(declared.effects ?? {});
  const stateRows = declared.states.map((state) => [
    state === initial ? `${code(state)}（初始）` : code(state),
    (docs.states as Record<string, string>)[state] ?? "",
    soundText(declared.sounds.states[state] ?? null),
  ]);
  const sections: (string | undefined)[] = [
    `# ${docs.title} \`${name}\``,
    `- **效果**：${declared.effect}\n- **适合表达**：${declared.suitedFor}`,
    "## 调用示例",
    `\`\`\`json\n${exampleOf(name, docs)}\n\`\`\``,
    "## 参数",
    paramsSection(declared, docs),
    docs.paramNotes,
    "## 占几格",
    isConnector(declared) ? CONNECTOR_CELLS : (docs.cells ?? ""),
    "## 状态",
    `第一个状态是初始状态。切到某个状态时放表里的音效（入场时只放入场音效，不放初始状态的音效；之后切回初始状态时才放）。\n\n${table(["状态", "画面上", "切到时的音效"], stateRows)}`,
    docs.stateNotes,
    "## 入场和退场动画",
    [
      `- 入场默认 ${code(declared.enter)}，退场默认 ${code(declared.exit)}（分镜不写 \`animation\` 时）。`,
      `- 都能用通用动画 ${list(ANIMATIONS)}${
        effects.length > 0
          ? `，以及只有这个组件能用的特殊效果 ${effects.map(([effect, seconds]) => `${code(effect)}（${seconds} 秒）`).join("、")}`
          : ""
      }。取值见 \`docs/reference/storyboard.md\`「分镜」。`,
    ].join("\n"),
    docs.animationNotes,
    "## 音效",
    `入场 ${soundText(declared.sounds.enter)}，退场 ${soundText(declared.sounds.exit)}；切到各状态的音效见「状态」。音效 ID 见 \`docs/reference/storyboard.md\`「音效」。`,
    ...(isConnector(declared)
      ? []
      : [
          "## 嵌套",
          docs.nesting ??
            (declared.labelArea
              ? "有标签要让开（`labelArea`），子组件不能压住它。"
              : "没有要让开的字，子组件可以嵌在任何格子里。"),
        ]),
    ...(docs.notes ? ["## 细节", docs.notes] : []),
    "## 样张",
    `Studio 里的 \`Sample-${name}\`：${docs.sample}`,
  ];
  return `${sections.filter((section) => section !== undefined && section !== "").join("\n\n")}\n`;
};

/** 目录页：每个组件一行，加上所有组件通用的规则 */
const indexPage = (declarations: ComponentDeclarations): string => {
  const rows = Object.entries(declarations).map(([name, declared]) => [
    `[${declared.docs?.title ?? name} \`${name}\`](${name}.md)`,
    declared.effect,
    declared.suitedFor,
  ]);
  return `${[
    "# 组件目录",
    "写分镜能用的组件。先在下表挑组件，再读选中组件的详情页（参数、占几格、状态、入场和退场动画、音效、调用示例），分镜里用 `component` 写组件名来调用。",
    "本目录由 `cd video && npm run catalog` 从组件声明（`video/src/components/*-declaration.ts`）生成，不要手改；`npm run test` 检查它和声明一致。",
    table(["组件", "效果", "适合表达"], rows),
    "## 通用规则",
    [
      "- 动作和 `animation` 的取值见 `docs/reference/storyboard.md`「分镜」，摆放见同一份的「网格」「嵌套」，字放不下怎么算见「字宽估算」，显示文字的出处见「显示文字」，音效 ID 见「音效」。",
      "- 入场时组件处在**第一个状态**（初始状态），只响入场音效；之后切回初始状态时才响初始状态的音效。音效写「不放」的，切到那个状态时没有声音。",
      "- 入场、退场都能用通用动画 `fade`、`slide`、`none`；详情页写的是不写 `animation` 时用的默认动画，和组件自己的特殊效果。",
      "- 「显示文字」参数的值必须出自本画面的画面说明或旁白句。",
      "- 常驻组件（字幕、左上角的主题）和片头片尾不是分镜组件，不在这里。",
      "- 所有组件依次演一遍的样片：合成 `ComponentSamples`（把每个组件的 `Sample-<组件名>` 首尾相接），`cd video && npx remotion render ComponentSamples out/component-samples.mp4`。",
    ].join("\n"),
  ].join("\n\n")}\n`;
};

/** 组件注册表 → 组件目录的文件名到内容 */
export const generateCatalog = (declarations: ComponentDeclarations): Record<string, string> => ({
  "index.md": indexPage(declarations),
  ...Object.fromEntries(
    Object.entries(declarations).map(([name, declared]) => [`${name}.md`, detailPage(name, declared)]),
  ),
});
