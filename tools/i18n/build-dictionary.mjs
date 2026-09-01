#!/usr/bin/env node
/**
 * build-dictionary.mjs — ja 鍵の対訳を 1 本にまとめて TypeScript を書き出す。
 *
 *   node tools/i18n/build-dictionary.mjs
 *
 * 入力（すべて ja を鍵にした素の JSON。人が読める順で分割してある）:
 *   data/seed.json            … 既に決着済みの訳（用語集 / messages / コード / キオスク）
 *   data/translations/*.json  … 今回の移行で足した訳。1 ファイル = 1 バッチ
 *   data/ambiguous.json       … **辞書に入れない** 語（下記）
 *
 * 出力:
 *   coolify/apps/nextjs-web/src/lib/ui-dictionary/{en,zh}.ts
 *
 * ■ ambiguous とは
 * 同じ日本語が文脈で別の意味になる語（「キャンセル」= 操作をやめる / 書類を
 * 取り消す、「承認」= Approval / Approve、「有効」= Enabled / Active）。
 * ja を鍵にすると片方の訳しか持てないので、**辞書に入れない**。これらは
 * 値に紐づいた既存の型付きの表（StatusBadge の STATUS_MAPS / enum-labels /
 * next-intl の common）が文脈ごとに持つ。
 * 用語集 §5「未決」が「キャンセル」について書いているのと同じ問題。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const DATA = path.join(HERE, "data");
const OUT = path.join(REPO, "coolify/apps/nextjs-web/src/lib/ui-dictionary");

const ambiguous = new Set(
  JSON.parse(fs.readFileSync(path.join(DATA, "ambiguous.json"), "utf8")),
);

/** ja → { en, zh }。後から読んだものは既にある鍵を上書きしない。 */
const dict = new Map();
const problems = [];

function ingest(label, obj) {
  for (const [ja, value] of Object.entries(obj)) {
    const [en, zh] = Array.isArray(value) ? value : [value.en, value.zh];
    if (!en || !zh) {
      problems.push(`${label}: 「${ja}」の訳が欠けています`);
      continue;
    }
    if (ambiguous.has(ja)) {
      problems.push(
        `${label}: 「${ja}」は文脈で意味が変わる語なので辞書に入れられません（型付きの表を使うこと）`,
      );
      continue;
    }
    if (ja.includes("${")) {
      problems.push(`${label}: 「${ja}」はテンプレートの断片です（ICU へ）`);
      continue;
    }
    const prev = dict.get(ja);
    if (prev && (prev.en !== en || prev.zh !== zh)) {
      problems.push(
        `${label}: 「${ja}」に 2 通りの訳（${prev.en}/${prev.zh} と ${en}/${zh}）`,
      );
      continue;
    }
    dict.set(ja, { en, zh });
  }
}

ingest("seed", JSON.parse(fs.readFileSync(path.join(DATA, "seed.json"), "utf8")));

const batchDir = path.join(DATA, "translations");
for (const file of fs.readdirSync(batchDir).sort()) {
  if (!file.endsWith(".json")) continue;
  ingest(
    `translations/${file}`,
    JSON.parse(fs.readFileSync(path.join(batchDir, file), "utf8")),
  );
}

if (problems.length > 0) {
  console.error(`✗ ${problems.length} 件:`);
  for (const p of problems.slice(0, 40)) console.error("  -", p);
  if (problems.length > 40) console.error(`  … 他 ${problems.length - 40} 件`);
  process.exit(1);
}

const header = (locale, name) => `/**
 * ${locale}.ts — 日本語の画面文言 → ${name}。**生成物・手で編集しない。**
 *
 *   直すとき: tools/i18n/data/translations/*.json を直して
 *             node tools/i18n/build-dictionary.mjs
 *
 * 鍵は日本語そのもの。理由と使い方は src/lib/ui-text.ts の冒頭。
 * 訳語の正は _specs/i18n-glossary.md — 新しい語はまずあちらに 1 行足す。
 */

export const ${locale}: Record<string, string> = {
`;

const sorted = [...dict.entries()].sort(([a], [b]) => a.localeCompare(b, "ja"));

for (const [locale, name] of [
  ["en", "English"],
  ["zh", "简体中文"],
]) {
  const body = sorted
    .map(([ja, tr]) => `  ${JSON.stringify(ja)}: ${JSON.stringify(tr[locale])},`)
    .join("\n");
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, `${locale}.ts`),
    `${header(locale, name)}${body}\n};\n`,
  );
}

console.log(`✓ ${dict.size} 語を書き出しました → src/lib/ui-dictionary/{en,zh}.ts`);
