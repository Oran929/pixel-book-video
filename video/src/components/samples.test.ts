import { describe, expect, it } from "vitest";
import { ANIMATIONS } from "./declaration";
import { COMPONENT_DECLARATIONS } from "./declarations";
import { COMPONENT_SAMPLES, samplePlan } from "./samples";

// 组件注册表一致性：每个组件都有样张页（Studio 里的 `Sample-<组件名>`），
// 样张用假分镜把组件的每个状态、每种入场和退场动画都演一遍，并且通过分镜检查
const names = Object.keys(COMPONENT_DECLARATIONS) as (keyof typeof COMPONENT_DECLARATIONS)[];

describe("组件样张", () => {
  it("每个登记的组件都有样张，没有多余的样张", () => {
    expect(Object.keys(COMPONENT_SAMPLES).sort()).toEqual([...names].sort());
  });

  describe.each(names)("%s 的样张", (name) => {
    const cues = () =>
      samplePlan(name).cues.filter((cue) => cue.component === name);

    it("通过分镜检查和排期", () => {
      expect(() => samplePlan(name)).not.toThrow();
    });

    it("演到组件的每个状态", () => {
      const shown = new Set(
        cues().flatMap((cue) => [cue.initialState, ...cue.states.map((s) => s.state)]),
      );
      expect([...shown].sort()).toEqual([...COMPONENT_DECLARATIONS[name].states].sort());
    });

    it("演到每种入场和退场动画", () => {
      const enters = new Set(cues().map((cue) => cue.enter.animation));
      const exits = new Set(cues().flatMap((cue) => (cue.exit ? [cue.exit.animation] : [])));
      expect([...enters].sort()).toEqual([...ANIMATIONS].sort());
      expect([...exits].sort()).toEqual([...ANIMATIONS].sort());
    });
  });
});
