import { AbsoluteFill } from "remotion";
import { CHANNEL, COLOR, outlinedText, SIZE } from "../style/style";

/** 频道名（外壳，初版）：左上角，彩色像素字加一个字体像素宽的深色描边 */
export const ChannelName: React.FC = () => (
  <AbsoluteFill style={{ padding: SIZE.margin }}>
    <div style={outlinedText("subtitle", COLOR.channelName, COLOR.ink)}>
      {CHANNEL.name}
    </div>
  </AbsoluteFill>
);
