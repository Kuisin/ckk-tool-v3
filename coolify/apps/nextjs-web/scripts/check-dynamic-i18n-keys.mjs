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

const NAMESPACES = new Set(Object.keys(ja));

/** `tr(\`ns.x.${v}\`)` の形と、変数に入れてから tr() へ渡す template literal の両方。 */
const TEMPLATE = /`([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)\.\$\{/g;
/** `"settings.kioskSettings.stepExecution"` のように鍵を文字列定数で持ち、
 *  あとで tr(key) する形（verify-keys は tr("…") 直書きしか見ない）。 */
const LITERAL = /["']([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+){2,})["']/g;

function leaf(path) {
  let d = ja;
  for (const p of path.split(".")) {
    if (!d || typeof d !== "object" || !(p in d)) return false;
    d = d[p];
  }
  return typeof d === "string";
}

const missing = new Map();
let seen = 0;
const note = (key, file) => {
  if (!missing.has(key)) missing.set(key, new Set());
  missing.get(key).add(relative(ROOT, file));
};
for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(TEMPLATE)) {
    if (!NAMESPACES.has(m[1].split(".")[0])) continue;
    seen++;
    if (!has(m[1])) note(`${m[1]}.*`, file);
  }
  // 文字列定数の鍵は、そのファイルが「変数を tr() に渡している」ときだけ見る
  // （`tr(LABEL_KEY[k])` の形）。label(key, locale, fallback) / msg(…) のように
  // 既定文言を一緒に持つ呼び出しは、鍵が無くても画面は壊れないので対象外。
  // 直書きの tr("…") は verify-keys が見る。
  const passesVariableToTr =
    /\btr\(\s*[A-Za-z_$][\w$.[\]?]*\s*(?:\?\?|\))/.test(src);
  if (!passesVariableToTr) continue;
  for (const m of src.matchAll(LITERAL)) {
    const first = m[1].split(".")[0];
    if (!NAMESPACES.has(first)) continue;
    if (/\.(com|jp|net|co|org|io)$/.test(m[1])) continue; // ホスト名
    const before = src.slice(Math.max(0, m.index - 8), m.index);
    if (/\b(tr|t|label|msg|L)\($/.test(before)) continue;
    seen++;
    if (!leaf(m[1])) note(m[1], file);
  }
}

if (missing.size > 0) {
  console.error(
    `check-dynamic-i18n-keys: messages/ja.json に無い鍵（${missing.size} 件 / 検査 ${seen} 箇所）:`,
  );
  for (const [k, files] of missing)
    console.error(`  MISSING ${k}  <- ${[...files].join(", ")}`);
  console.error(
    "\nmessages/{ja,en,zh}.json に足してください（template literal は名前空間、文字列定数は葉まで）。",
  );
  process.exit(1);
}
console.log(`check-dynamic-i18n-keys: OK（${seen} 箇所を検査）`);
