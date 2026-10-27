# 用 Remotion（React + TypeScript）生成视频

视频由数据驱动：每期只产出旁白稿和分镜数据，外壳和组件是固定代码。Remotion 用 React 描述画面，最适合这种 JSON 驱动的方式；对话框、HUD 等像素 UI 可以直接用 CSS 实现；TypeScript 加 zod 能在渲染前发现 AI 生成的分镜数据里的错误。许可证对个人和不超过 3 人的公司免费，可以商用。

## Considered Options

- **Motion Canvas**：真开源、动画更细腻，但采用命令式写法，不适合数据驱动；像素 UI 要自己在 canvas 里画。
- **Revideo**：Motion Canvas 的分支，面向自动化，但社区小、资料少。
- **Manim**：Python 实现，擅长数学动画，不适合像素风 UI。
