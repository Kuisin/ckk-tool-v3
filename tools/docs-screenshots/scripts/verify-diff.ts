/**
 * verify-diff.ts — 決定性検証: 2 ディレクトリの同名 PNG を pixelmatch で比較。
 * 使い方: tsx scripts/verify-diff.ts <committedDir> <freshDir>
 * どれか 1 枚でも diff 比率 >= 0.1% なら exit 1。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const [committedDir, freshDir] = process.argv.slice(2);
if (!committedDir || !freshDir) {
  console.error("usage: verify-diff.ts <committedDir> <freshDir>");
  process.exit(2);
}

const THRESHOLD_RATIO = 0.001; // 0.1%

let failures = 0;
let compared = 0;

for (const name of readdirSync(freshDir).filter((n) => n.endsWith(".png"))) {
  const committedPath = join(committedDir, name);
  if (!existsSync(committedPath)) {
    console.warn(`⚠ ${name}: no committed baseline — first capture? skipping`);
    continue;
  }
  const a = PNG.sync.read(readFileSync(committedPath));
  const b = PNG.sync.read(readFileSync(join(freshDir, name)));
  compared++;
  if (a.width !== b.width || a.height !== b.height) {
    console.error(`✖ ${name}: size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    failures++;
    continue;
  }
  const diff = pixelmatch(a.data, b.data, undefined, a.width, a.height, {
    threshold: 0.1,
  });
  const ratio = diff / (a.width * a.height);
  const pct = (ratio * 100).toFixed(4);
  if (ratio >= THRESHOLD_RATIO) {
    console.error(`✖ ${name}: diff ${pct}% (>= 0.1%)`);
    failures++;
  } else {
    console.log(`✓ ${name}: diff ${pct}%`);
  }
}

if (failures > 0) {
  console.error(`\ndocs:verify failed — ${failures}/${compared} shot(s) exceeded threshold`);
  process.exit(1);
}
console.log(`docs:verify OK — ${compared} shot(s) within threshold`);
