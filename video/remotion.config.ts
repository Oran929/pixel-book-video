import { Config } from "@remotion/cli/config";

// 中间帧用 PNG：JPEG 压缩会让像素边缘出现杂色（票 09）
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
