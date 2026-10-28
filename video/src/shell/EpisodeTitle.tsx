import { AbsoluteFill } from "remotion";
import { COLOR, outlinedText, SIZE } from "../style/style";

/** 这一期的书名或主题名（外壳）：左上角，彩色像素字加一个字体像素宽的深色描边 */
export const EpisodeTitle: React.FC<{ title: string }> = ({ title }) => (
  <AbsoluteFill style={{ padding: SIZE.margin }}>
    <div style={outlinedText("subtitle", COLOR.episodeTitle, COLOR.ink)}>
      {title}
    </div>
  </AbsoluteFill>
);
