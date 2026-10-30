import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { CATALOG_DIR, generateCatalog } from "./catalog";
import { COMPONENT_DECLARATIONS } from "./declarations";

// `npm run catalog`：从组件声明生成组件目录，写进 `docs/reference/components/`，
// 删掉目录里不再生成的 `.md`（组件改名或删掉之后）。

const catalog = generateCatalog(COMPONENT_DECLARATIONS);
mkdirSync(CATALOG_DIR, { recursive: true });
for (const file of readdirSync(CATALOG_DIR)) {
  if (file.endsWith(".md") && !(file in catalog)) rmSync(new URL(file, CATALOG_DIR));
}
for (const [file, content] of Object.entries(catalog)) {
  writeFileSync(new URL(file, CATALOG_DIR), content);
}
console.log(`组件目录：写了 ${Object.keys(catalog).length} 个文件到 docs/reference/components/`);
