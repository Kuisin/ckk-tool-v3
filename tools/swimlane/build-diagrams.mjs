/**
 * build-diagrams.mjs — diagrams/*.txt（kai-swimlane DSL）を SVG に変換して
 * マニュアルの assets へ書き出す。生成物はコミットする。
 *
 *   node tools/swimlane/build-diagrams.mjs
 *
 * ロケール: `<name>.txt`（ja・既定言語・無印）に加えて
 * `<name>.en.txt` / `<name>.zh.txt` があれば同じ基底名で処理し、
 * `<name>.en.svg` / `<name>.zh.svg` として書き出す（`<name>.svg` はそのまま
 * ja 用として残る — ja の `.md` はこれを参照するので、リネーム・削除しない）。
 * `<name>.en.txt` の基底名は `<name>` で、`readdirSync` の対象は
 * `*.txt`（`*.en.txt` / `*.zh.txt` を含む）全件 — ロケール判定は
 * ファイル名末尾の `.en` / `.zh` の有無だけで行い、DSL の中身は見ない。
 *
 * 失敗条件（exit 1・部分出力なし）:
 *  - DSL のパース/レンダリングエラー
 *  - 生成 SVG のルート要素に viewBox が無い
 *    （fumadocs remark-image → next/image 静的 import が寸法抽出に要求する。
 *      image-size は viewBox から寸法を導出できる）
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { textToSvg } from "./vendor/render-pure/text-to-svg.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, "diagrams");
const OUT_DIR = resolve(
  HERE,
  "../../coolify/apps/nextjs-web/content/manual/assets/diagrams",
);

const files = readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".txt"))
  .sort();
if (files.length === 0) {
  console.error(`no *.txt sources in ${SRC_DIR}`);
  process.exit(1);
}

const results = [];
let failed = false;

for (const file of files) {
  let dsl = readFileSync(join(SRC_DIR, file), "utf8");
  // Markdown フェンス同様、@kai-swimlane / @end マーカーは省略可にする
  if (!dsl.includes("@kai-swimlane")) {
    dsl = `@kai-swimlane\n${dsl}\n@end\n`;
  }
  const { svg, errors } = textToSvg(dsl, { themeKey: "basic" });
  if (errors?.length) {
    failed = true;
    console.error(`✖ ${file}:`);
    for (const e of errors) console.error(`    ${e.line != null ? `L${e.line}: ` : ""}${e.message ?? e}`);
    continue;
  }
  const root = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";
  const viewBox = root.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) {
    failed = true;
    console.error(`✖ ${file}: SVG root is missing viewBox`);
    continue;
  }
  // "process-overview.txt" → "process-overview" / "process-overview.en.txt" →
  // "process-overview.en" — the locale suffix (if any) is already part of the
  // basename, so no further parsing is needed; it becomes the output basename.
  const outName = basename(file, ".txt");
  results.push({ file, outName, svg, viewBox });
}

if (failed) process.exit(1);

mkdirSync(OUT_DIR, { recursive: true });
for (const { outName, svg, viewBox } of results) {
  const out = join(OUT_DIR, `${outName}.svg`);
  writeFileSync(out, svg.endsWith("\n") ? svg : `${svg}\n`);
  const [, , w, h] = viewBox.split(/\s+/);
  console.log(`✓ ${basename(out)}  ${w}×${h}`);
}
