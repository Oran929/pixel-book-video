import { z } from "zod";

// 合成清单（ADR-0004）：Python 生成，Remotion 只读这一份交接文件。
// 字段与 tools/src/pixelbook/pipeline.py 写出的格式一一对应。
export const EpisodeManifestSchema = z
  .object({
  // 生成这期配音时的音色指纹（tools/src/pixelbook/tts_cache.py）
  voice_fingerprint: z.string().regex(/^[0-9a-f]{16}$/, "应为 16 位十六进制指纹"),
  // 这一期的书名或主题名（旁白稿顶层的 `title`），显示在画面左上角
  title: z.string().min(1, "不能为空"),
  segments: z.array(z.object({ id: z.string(), title: z.string() })).min(1),
  scenes: z.array(z.object({ id: z.string(), segment: z.string() })).min(1),
  lines: z
    .array(
      z.object({
        id: z.string(),
        scene: z.string(),
        text: z.string(),
        // 以 video/public/ 为起点的路径，交给 staticFile()
        audio: z.string(),
        // 测量音频文件得出的时长（秒）
        seconds: z.number().positive(),
      }),
    )
    .min(1),
  })
  .superRefine((manifest, ctx) => {
    const segments = new Set(manifest.segments.map((s) => s.id));
    const scenes = new Set(manifest.scenes.map((s) => s.id));
    manifest.scenes.forEach((scene, i) => {
      if (!segments.has(scene.segment)) {
        ctx.addIssue({
          code: "custom",
          path: ["scenes", i, "segment"],
          message: `段 ${scene.segment} 不存在`,
        });
      }
    });
    manifest.lines.forEach((line, i) => {
      if (!scenes.has(line.scene)) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "scene"],
          message: `画面 ${line.scene} 不存在`,
        });
      }
    });
  });

export type EpisodeManifest = z.infer<typeof EpisodeManifestSchema>;

const formatPath = (path: PropertyKey[]) =>
  path
    .map((key, i) =>
      typeof key === "number" ? `[${key}]` : `${i ? "." : ""}${String(key)}`,
    )
    .join("");

/** 校验合成清单；不合格时报错，每个问题写明字段位置 */
export const parseManifest = (data: unknown): EpisodeManifest => {
  const result = EpisodeManifestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  ${formatPath(issue.path)}: ${issue.message}`,
    );
    throw new Error(`合成清单格式不对：\n${issues.join("\n")}`);
  }
  return result.data;
};
