#!/usr/bin/env node
/**
 * check-audit-table-labels.mjs — CI ガード: `recordAudit({ tableName: "..." })`
 * が書く**表名の文字列リテラル**すべてに `audit.table.<name>`（SY07 操作履歴の
 * 「対象」列のラベル）が実在することを検査する。
 *
 * 背景: `lib/audit-record-key-core.ts` の登録簿と同じ形の穴 — 新しい監査
 * テーブルを足したのに `messages/ja.json` の `audit.table` へラベルを足し
 * 忘れると、SY07 の一覧・詳細に生のテーブル名（`kiosk_unlock_pins` 等）が
 * そのまま出る。`check-dynamic-i18n-keys.mjs` と同種の穴だが、あちらは
 * 「鍵の名前空間が実在するか」しか見ないので、この 1 テーブル分の網羅性
 * までは拾えない。
 *
 * **これは静的な文字列リテラルしか拾えない — 完全な網羅ではない。**
 * 5 箇所は実行時の変数を `tableName` に渡している（`ownerType` / `table` /
 * `AUDIT_TABLE[kind]`）ので、この正規表現では検出できない。それらは下の
 * `DYNAMIC_TABLE_NAME_SITES` に理由つきで明示し、**その行が消えたら
 * このスクリプト自身が気づく**（allowlist が腐って別の意味を持ってしまう
 * ことを防ぐ）。動的な側で書きうる表名（`ownerType` は実在の表名、
 * `AUDIT_TABLE[kind]` は材種番号の部品マスタ 7 表）は、静的リテラルとして
 * どこか別の場所（呼び出し元・レジストリ）に必ず書かれているので、
 * 実際にはこのスキャンで一緒に拾えている。
 *
 * このスクリプトはフィールドラベル（`audit.fieldLabels`）の網羅性は保証
 * しない — `after`/`before` の payload はスプレッド（`...v`）を含み、
 * キーを静的に数え上げられないため。未知の列名はキーをそのまま出す
 * （`audit-field-labels.ts` の既定の失敗の仕方）でよしとする。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const ja = JSON.parse(readFileSync(join(ROOT, "messages", "ja.json"), "utf8"));
const TABLE_LABELS = ja.audit?.table ?? {};

/**
 * 実行時の変数を tableName に渡している箇所（静的リテラルでは拾えない）。
 * ファイルが変わった／該当行が無くなったら「allowlist が腐っている」ので
 * 検査自体を落とす。
 */
const DYNAMIC_TABLE_NAME_SITES = [
  {
    file: "src/lib/attachments.ts",
    // ownerType は実在の表名（多態参照 — audit_logs.record_id と同じ規約）。
    pattern: /tableName:\s*(?:ownerType|row\.ownerType)\s*,/,
  },
  {
    file: "src/lib/document-memos.ts",
    pattern: /tableName:\s*(?:ownerType|row\.ownerType)\s*,/,
  },
  {
    file: "src/app/(dashboard)/master/material-numbering/actions.ts",
    // table 引数 / AUDIT_TABLE[kind] マップ（採番構成 MS07 の部品マスタ 7 表）。
    pattern: /tableName:\s*(?:table|AUDIT_TABLE\[kind\])\s*[,}]/,
  },
];

for (const site of DYNAMIC_TABLE_NAME_SITES) {
  const path = join(ROOT, site.file);
  let src;
  try {
    src = readFileSync(path, "utf8");
  } catch {
    console.error(
      `check-audit-table-labels: allowlist が腐っている — ${site.file} が見つからない。動的 tableName の場所を確認して allowlist を直してください。`,
    );
    process.exit(1);
  }
  if (!site.pattern.test(src)) {
    console.error(
      `check-audit-table-labels: allowlist が腐っている — ${site.file} に動的な tableName の記述が見当たらない。allowlist を見直してください（このファイルの意味が変わったか、削除された可能性）。`,
    );
    process.exit(1);
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

const TABLE_NAME_LITERAL = /tableName:\s*"([a-z_]+)"/g;
const written = new Map(); // table name -> Set<relative file path>

for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(TABLE_NAME_LITERAL)) {
    const table = m[1];
    if (!written.has(table)) written.set(table, new Set());
    written.get(table).add(relative(ROOT, file));
  }
}

const missing = [...written.keys()].filter(
  (table) => typeof TABLE_LABELS[table] !== "string",
);

if (missing.length > 0) {
  console.error(
    `check-audit-table-labels: messages/ja.json の audit.table に無い表名（${missing.length} 件）:`,
  );
  for (const table of missing.sort()) {
    console.error(
      `  MISSING ${table}  <- ${[...written.get(table)].join(", ")}`,
    );
  }
  console.error(
    "\nmessages/{ja,en,zh}.json の audit.table に 1 行足してください（SY07 操作履歴の「対象」列のラベル）。",
  );
  process.exit(1);
}
console.log(
  `check-audit-table-labels: OK（${written.size} 表名を検査、動的 ${DYNAMIC_TABLE_NAME_SITES.length} 箇所は allowlist で確認）`,
);
