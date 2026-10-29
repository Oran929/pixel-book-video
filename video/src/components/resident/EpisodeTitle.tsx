import { AbsoluteFill } from "remotion";
import { COLOR, outlinedText, SIZE } from "../../style/style";

/** 这一期的主题（常驻组件）：左上角，彩色像素字加一个字体像素宽的深色描边 */
export const EpisodeTitle: React.FC<{ title: string }> = ({ title }) => (
  <AbsoluteFill style={{ padding: SIZE.margin }}>
    <div style={outlinedText("subtitle", COLOR.episodeTitle, COLOR.ink)}>
      {title}
    </div>
  </AbsoluteFill>
);
