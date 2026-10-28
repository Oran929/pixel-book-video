// 节奏产物：打点时间表、总时长报告。都由时间轴算出，这里只有纯函数。
import type { Timeline } from "./timeline";

const pad = (n: number) => String(n).padStart(2, "0");

/** 段开始时间（秒）→ 打点时间：向下取整；不到 1 小时 `mm:ss`，否则 `h:mm:ss` */
export const formatSegmentStart = (seconds: number): string => {
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/** 打点时间表 `segments.txt` 的内容：每段一行 `00:00 段标题`，可直接贴到视频平台的分段设置 */
export const segmentsText = ({
  fps,
  segments,
}: Pick<Timeline, "fps" | "segments">): string =>
  segments
    .map((s) => `${formatSegmentStart(s.startFrame / fps)} ${s.title}\n`)
    .join("");

/** 一期总时长的目标范围（含停顿），单位秒：4:00–6:00，两端都算在范围内 */
export const DURATION_RANGE = { min: 4 * 60, max: 6 * 60 } as const;

export type DurationVerdict = "within" | "too-short" | "too-long";

export type DurationReport = {
  /** 总帧数 ÷ 帧率，不取整 */
  seconds: number;
  /** `m:ss`，向下取整到秒 */
  text: string;
  /** 按显示出来的整秒判断，避免出现"6:00 太长" */
  verdict: DurationVerdict;
};

export const durationReport = ({
  fps,
  totalFrames,
}: Pick<Timeline, "fps" | "totalFrames">): DurationReport => {
  const seconds = totalFrames / fps;
  const whole = Math.floor(seconds);
  const verdict: DurationVerdict =
    whole < DURATION_RANGE.min
      ? "too-short"
      : whole > DURATION_RANGE.max
        ? "too-long"
        : "within";
  return {
    seconds,
    text: `${Math.floor(whole / 60)}:${pad(whole % 60)}`,
    verdict,
  };
};
