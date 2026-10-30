// 测试用：分镜要求每个画面至少一个组件（#46）。很多测试只关心一个画面，
// 这里给分镜没写到的画面各补一个占位组件，补在分镜最后，不放音效、不显示字，
// 所以不改变被测画面的触发和音效。分镜写了但组件为空的画面不补，留给检查报错。
import { z } from "zod";
import { type ComponentDeclarations, declareComponent } from "../../components/declaration";
import { COMPONENT_DECLARATIONS } from "../../components/declarations";

const FILLER = "TestFiller";

const FILLER_DECLARATION = declareComponent({
  effect: "测试用",
  suitedFor: "测试用",
  props: z.strictObject({}),
  states: ["idle"],
  cells: () => [1, 1],
  enter: "fade",
  exit: "fade",
  connector: false,
  sounds: { enter: null, exit: null, states: { idle: null } },
});

type Manifest = {
  scenes: { id: string }[];
  lines: { id: string; scene: string }[];
};
type Storyboard = { scenes: { scene: string }[] };

/** 给分镜补上没写到的画面，并把占位组件加进组件声明；不是对象的分镜原样返回 */
export const withEveryScene = (
  manifest: unknown,
  storyboard: unknown,
  components: ComponentDeclarations = COMPONENT_DECLARATIONS,
): [unknown, ComponentDeclarations] => {
  const declarations = { ...components, [FILLER]: FILLER_DECLARATION };
  const board = storyboard as Storyboard | null;
  const { scenes, lines } = manifest as Manifest;
  if (!board || !Array.isArray(board.scenes) || !Array.isArray(scenes)) {
    return [storyboard, declarations];
  }
  const written = new Set(board.scenes.map((scene) => scene.scene));
  const fillers = scenes
    .filter(({ id }) => !written.has(id))
    .flatMap(({ id }) => {
      const first = lines.find((line) => line.scene === id);
      if (!first) return [];
      return [
        {
          scene: id,
          components: [{ id: "filler", component: FILLER, props: {}, at: [11, 5] }],
          triggers: [{ target: "filler", line: first.id, offset: 0, action: "enter" }],
        },
      ];
    });
  return [{ ...board, scenes: [...board.scenes, ...fillers] }, declarations];
};
