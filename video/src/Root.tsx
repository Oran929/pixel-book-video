import { Composition } from "remotion";
import {
  calculateEpisodeMetadata,
  Episode,
  type EpisodeProps,
} from "./episode/Episode";
// 像素字体在第一帧之前加载完（模块加载时挡住渲染）
import "./style/font";
import { STYLE_SHEET, StyleSheet } from "./stylesheet/StyleSheet";
import { VIDEO } from "./video-config";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Episode"
      component={Episode}
      calculateMetadata={calculateEpisodeMetadata}
      defaultProps={{ timeline: null, cues: [] } satisfies EpisodeProps}
      // 占位值：实际总帧数由 calculateMetadata 从时间轴算出
      durationInFrames={1}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
    />
    {/* 风格样张：只在 Studio 里预览，渲染命令只渲染 Episode */}
    <Composition
      id="StyleSheet"
      component={StyleSheet}
      durationInFrames={1}
      fps={VIDEO.fps}
      width={STYLE_SHEET.width}
      height={STYLE_SHEET.height}
    />
  </>
);
