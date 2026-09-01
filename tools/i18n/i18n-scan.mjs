#!/usr/bin/env node
/**
 * i18n-scan.mjs — 未翻訳の日本語がどれだけ残っているかを数え、**増えていたら落とす**。
 *
 *   node tools/i18n/i18n-scan.mjs                 # 残数を表示（baseline と比較）
 *   node tools/i18n/i18n-scan.mjs --list          # 残っている場所を一覧
 *   node tools/i18n/i18n-scan.mjs --list --app web --area components/sales
 *   node tools/i18n/i18n-scan.mjs --update-baseline   # 移行を進めた後に基準を下げる
 *
 * ■ なぜ「0 でなければ失敗」にしないのか
 * 対象は数千文字列で、1 回の作業では終わらない。全消しを条件にすると
 * CI は初日から赤のままになり、**赤いのが当たり前になって誰も見なくなる**。
 * 見たいのは残数そのものではなく後戻りなので、baseline より増えたときだけ
 * 落とす（ratchet）。減ったときは「下げられます」と教えるだけで落とさない —
 * 別の作業をしている人の PR を、無関係な baseline 更新で止めないため。
 *
 * 数え方と除外の定義は lib/scan.mjs。ここが数えるのは「`tr()`/`translate()`
 * に包まれていない生の日本語リテラル」だけ。ja を鍵にした旧辞書は退役済み
 * ——文言は `messages/*.json` 1 本に統合した（`coolify/apps/nextjs-web/CLAUDE.md`
 * の i18n 節）。ここに挙がった文字列を包むときは
 * `tools/i18n-unify/generate-keys.mjs` + `rewrite-call-sites.mjs` で
 * 本物の next-intl 鍵を発番する。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanDir } from "./lib/scan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const BASELINE = path.join(HERE, "baseline.json");

/** 走査対象。admintools は対象外（利用者の判断 — 社内運用ツールで日本語のみ）。 */
const APPS = {
  web: "coolify/apps/nextjs-web/src",
  kiosk: "coolify/apps/nextjs-kiosk/src",
};

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const onlyApp = valueOf("--app");
const areaFilter = valueOf("--area");

const results = {};
const allFindings = [];

for (const [app, rel] of Object.entries(APPS)) {
  if (onlyApp && app !== onlyApp) continue;
  const root = path.join(REPO, rel);
  if (!fs.existsSync(root)) continue;
  const findings = scanDir(root)
    .map((f) => ({ ...f, app, file: path.relative(REPO, f.file) }))
    .filter((f) => !areaFilter || f.file.includes(areaFilter));
  results[app] = findings.length;
  allFindings.push(...findings);
}

if (has("--list")) {
  const byFile = new Map();
  for (const f of allFindings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  const limit = Number(valueOf("--limit") ?? 40);
  for (const [file, items] of sorted.slice(0, limit)) {
    console.log(`\n${file}  (${items.length})`);
    for (const it of items.slice(0, 12)) {
      const text = it.text.length > 68 ? `${it.text.slice(0, 68)}…` : it.text;
      console.log(`  ${String(it.line).padStart(5)}  ${text}`);
    }
    if (items.length > 12) console.log(`  … +${items.length - 12} more`);
  }
  if (sorted.length > limit) {
    console.log(`\n… +${sorted.length - limit} more files (raise --limit)`);
  }
  console.log(`\nfiles: ${byFile.size}   strings: ${allFindings.length}`);
  process.exit(0);
}

const total = Object.values(results).reduce((a, b) => a + b, 0);

if (has("--update-baseline")) {
  const next = { ...results, total, updatedAt: new Date().toISOString() };
  fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log("baseline updated:", JSON.stringify(results));
  process.exit(0);
}

for (const [app, count] of Object.entries(results)) {
  console.log(`${app.padEnd(6)} untranslated: ${count}`);
}
console.log(`${"total".padEnd(6)} untranslated: ${total}`);

if (!fs.existsSync(BASELINE)) {
  console.log("\nno baseline yet — run with --update-baseline to create one");
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

// 部分走査（--app / --area）では全体の baseline と比較できない。
if (onlyApp || areaFilter) process.exit(0);

const regressions = Object.entries(results).filter(
  ([app, count]) => count > (baseline[app] ?? Number.POSITIVE_INFINITY),
);

if (regressions.length > 0) {
  console.error("\n✗ 未翻訳の日本語が増えています:");
  for (const [app, count] of regressions) {
    console.error(`    ${app}: ${baseline[app]} → ${count}`);
  }
  console.error(
    "\n  新しい画面の文言は messages/*.json（next-intl の実キー）か",
  );
  console.error(
    "  値に属するラベル（enum・状態・権限）なら lib/messages.ts 経由で置いてください。",
  );
  console.error("  詳しくは tools/i18n/README.md。");
  console.error(
    "  意図的に日本語のままにする 1 行には // i18n-ignore を付けます。",
  );
  process.exit(1);
}

const improved = Object.entries(results).filter(
  ([app, count]) => count < (baseline[app] ?? 0),
);
if (improved.length > 0) {
  console.log("\n✓ 減りました。基準を下げられます:");
  for (const [app, count] of improved) {
    console.log(`    ${app}: ${baseline[app]} → ${count}`);
  }
  console.log("    node tools/i18n/i18n-scan.mjs --update-baseline");
} else {
  console.log("\n✓ 後戻りなし");
}
