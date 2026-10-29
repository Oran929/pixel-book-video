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

/** 片头在打点时间表里的标题 */
export const INTRO_TITLE = "片头";

/** 时间轴里片头片尾的帧数可以不写（只有正文的时间轴），当作 0 */
type BookendFrames = Partial<Pick<Timeline, "introFrames" | "outroFrames">>;

/**
 * 打点时间表 `segments.txt` 的内容：每段一行 `00:00 段标题`，可直接贴到视频平台的分段设置。
 * 有片头时第一行是 `00:00 片头`：平台的分段要从 00:00 开始，正文各段写真实的开始时间（#50）。
 * 片尾（#51）每期都一样，不列。
 */
export const segmentsText = ({
  fps,
  segments,
  introFrames = 0,
}: Pick<Timeline, "fps" | "segments"> & BookendFrames): string =>
  (introFrames > 0 ? `${formatSegmentStart(0)} ${INTRO_TITLE}\n` : "") +
  segments
    .map((s) => `${formatSegmentStart(s.startFrame / fps)} ${s.title}\n`)
    .join("");

/** 一期总时长的目标范围（含停顿、片头和片尾），单位秒：4:00–6:00，两端都算在范围内 */
export const DURATION_RANGE = { min: 4 * 60, max: 6 * 60 } as const;

export type DurationVerdict = "within" | "too-short" | "too-long";

/** 整秒 → `m:ss`（分钟不补零） */
const minutesSeconds = (whole: number) =>
  `${Math.floor(whole / 60)}:${pad(whole % 60)}`;

const RANGE_TEXT = `${minutesSeconds(DURATION_RANGE.min)}–${minutesSeconds(DURATION_RANGE.max)}`;

/** 判断的说明文字，命令行原样打印（时间轴导出命令和 Python 的 `pixelbook render` 都用它） */
const VERDICT_TEXT: Record<DurationVerdict, string> = {
  within: `在 ${RANGE_TEXT} 之内`,
  "too-short": `太短（目标 ${RANGE_TEXT}，只报告）`,
  "too-long": `太长（目标 ${RANGE_TEXT}，只报告）`,
};

/** 一部分的时长：秒（不取整）和 `m:ss`（向下取整到秒） */
export type PartDuration = { seconds: number; text: string };

export type DurationReport = {
  /** 总帧数 ÷ 帧率，不取整 */
  seconds: number;
  /** `m:ss`，向下取整到秒 */
  text: string;
  /** 按显示出来的整秒判断，避免出现"6:00 太长" */
  verdict: DurationVerdict;
  /** `verdict` 的说明文字，例如"在 4:00–6:00 之内" */
  verdictText: string;
  /** 片头（#50）：第 0 帧到正文开始；不用片头时为 null */
  intro: PartDuration | null;
  /** 正文：从片头结束到片尾开始（最后一句音频结束）；没有片头片尾时就是全部 */
  body: PartDuration;
  /** 片尾（#51）：最后 `outroFrames` 帧；不用片尾时为 null */
  outro: PartDuration | null;
  /**
   * 总时长后面括号里分开写的各部分，例如「（片头 0:14，正文 4:26，片尾 0:07）」；没有片头
   * 也没有片尾时为空字符串。Python 的 `pixelbook render` 汇总原样打印（ADR-0004）
   */
  partsText: string;
};

/**
 * 总时长后面括号里分开写的各部分，例如「（片头 0:14，正文 4:26，片尾 0:07）」；
 * 没有片头也没有片尾时为空
 */
const partsText = ({ intro, body, outro }: Pick<DurationReport, "intro" | "body" | "outro">): string =>
  intro || outro
    ? `（${[
        intro && `片头 ${intro.text}`,
        `正文 ${body.text}`,
        outro && `片尾 ${outro.text}`,
      ]
        .filter(Boolean)
        .join("，")}）`
    : "";

export const durationReport = ({
  fps,
  totalFrames,
  introFrames = 0,
  outroFrames = 0,
}: Pick<Timeline, "fps" | "totalFrames"> & BookendFrames): DurationReport => {
  const seconds = totalFrames / fps;
  const whole = Math.floor(seconds);
  const verdict: DurationVerdict =
    whole < DURATION_RANGE.min
      ? "too-short"
      : whole > DURATION_RANGE.max
        ? "too-long"
        : "within";
  const part = (frames: number): PartDuration => ({
    seconds: frames / fps,
    text: minutesSeconds(Math.floor(frames / fps)),
  });
  const parts = {
    intro: introFrames > 0 ? part(introFrames) : null,
    body: part(totalFrames - introFrames - outroFrames),
    outro: outroFrames > 0 ? part(outroFrames) : null,
  };
  return {
    seconds,
    text: minutesSeconds(whole),
    verdict,
    verdictText: VERDICT_TEXT[verdict],
    ...parts,
    partsText: partsText(parts),
  };
};
