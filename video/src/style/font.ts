import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { FONT } from "./style";

// 像素字体必须在渲染第一帧之前加载完，否则开头几帧会用系统字体（票 09）。
// 在 Root.tsx 里引入一次：模块加载时就挡住渲染，字体加进 document.fonts 后放行。
const waiting = delayRender(`加载像素字体 ${FONT.file}`);
const face = new FontFace(
  FONT.family,
  `url("${staticFile(FONT.file)}") format("woff2")`,
);
face
  .load()
  .then(() => {
    document.fonts.add(face);
    continueRender(waiting);
  })
  .catch((error: unknown) => cancelRender(error));
