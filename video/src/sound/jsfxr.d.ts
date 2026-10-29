// jsfxr 没带类型声明；这里只声明生成音效用到的部分（`npm run sfx`，见 generate-sfx.ts）
declare module "jsfxr" {
  /** jsfxr 的 RIFFWAVE：`wav` 是整个 wav 文件的字节，`data` 是采样 */
  type Wave = { wav: number[]; data: number[]; clipping: number };
  export const sfxr: {
    /** 按展开后的参数生成 wav（不依赖 Web Audio，Node 里能用） */
    toWave(params: Record<string, unknown>): Wave;
  };
}
