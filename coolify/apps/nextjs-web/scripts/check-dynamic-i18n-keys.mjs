#!/usr/bin/env node
/**
 * check-dynamic-i18n-keys.mjs — CI ガード: `tr(\`enum.X_LABEL.${value}\`)` のように
 * **鍵の一部を実行時に組み立てる** next-intl 呼び出しについて、その接頭辞
 * （名前空間）が messages/ja.json に実在することを検査する。
 *
 * 背景: tools/i18n-unify/verify-keys.mjs は静的な鍵しか追えない。2026-09 の
 * i18n 化（#742）で 9 つの動的な鍵グループ（共有先ラベル・監査の対象名・
 * AI プロバイダのプリセット …）が JSON に入らないまま merge され、画面には
 * MISSING_MESSAGE が出ていた。静的検査では見えない穴なので、接頭辞の存在
 * だけをここで固定する（値の網羅は tr.has() を使う側の責任）。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const ja = JSON.parse(readFileSync(join(ROOT, "messages", "ja.json"), "utf8"));

function has(path) {
  let d = ja;
  for (const p of path.split(".")) {
    if (!d || typeof d !== "object" || !(p in d)) return false;
    d = d[p];
  }
  return typeof d === "object" && d !== null;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

const PATTERN = /\btr\(\s*`([A-Za-z0-9_.]+)\.\$\{/g;
const missing = new Map();
let seen = 0;
for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(PATTERN)) {
    seen++;
    if (!has(m[1])) {
      const rel = relative(ROOT, file);
      if (!missing.has(m[1])) missing.set(m[1], new Set());
      missing.get(m[1]).add(rel);
    }
  }
}

if (missing.size > 0) {
  console.error(
    `check-dynamic-i18n-keys: messages/ja.json に無い動的な鍵の接頭辞（${missing.size} 件 / 検査 ${seen} 箇所）:`,
  );
  for (const [k, files] of missing)
    console.error(`  MISSING ${k}  <- ${[...files].join(", ")}`);
  console.error(
    "\nmessages/{ja,en,zh}.json にその名前空間（値ごとの鍵）を足してください。",
  );
  process.exit(1);
}
console.log(`check-dynamic-i18n-keys: OK（${seen} 箇所を検査）`);
