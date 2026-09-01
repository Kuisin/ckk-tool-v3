#!/usr/bin/env node
/**
 * extract-pdf-labels.mjs — `lib/pdf-labels.ts` の訳を吸い出す。
 *
 * このファイルだけ他と作りが違う:
 *   - 言語が**外側**（`{ ja: {...}, en: {...} }`）
 *   - 表が**関数の中**にあり、実行時の値を埋め込む
 *     （`本見積書の有効期限は ${validUntil} まで…`）
 *
 * なので静的に読まず、**番兵の値で関数を呼んで結果を読む**。返ってきた文字列の
 * 番兵を `{validUntil}` のような穴に戻せば、そのまま JSON の値にできる。
 * 帳票は受取先の言語で出す決まりなので（用語集 §2.7）、ここの訳が閲覧者の
 * 設定で変わってはいけない — 穴の埋め方だけを `labelWith()` に任せる。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web");
const SRC = path.join(WEB, "src/lib/pdf-labels.ts");
const OUT = process.argv[2] ?? "/tmp/pdf-entries.json";

const tmp = path.join(WEB, "src/lib/.__pdf_tmp.ts");
fs.writeFileSync(tmp, fs.readFileSync(SRC, "utf8"));
const m = await import(`file://${tmp}`);
fs.rmSync(tmp, { force: true });

const LOCALES = ["ja", "en", "zh"];
const out = {};
const put = (ns, key, loc, val) => {
  out[`${ns}.${key}`] ??= {};
  out[`${ns}.${key}`][loc] = val;
};

// 実行時に埋まる値は番兵で呼び、あとで穴に戻す。
const S_VALID = "__VALID_UNTIL__";
const S_DUE = "__DUE_DATE__";
const S_BRANCH = "__BRANCH__";

for (const loc of LOCALES) {
  for (const [k, v] of Object.entries(m.quotePdfLabels(loc, S_VALID))) {
    put("QUOTE", k, loc, String(v).replaceAll(S_VALID, "{validUntil}"));
  }
  for (const [k, v] of Object.entries(m.deliveryNotePdfLabels(loc))) {
    put("DELIVERY_NOTE", k, loc, String(v));
  }
  for (const [k, v] of Object.entries(m.invoicePdfLabels(loc, S_DUE))) {
    put("INVOICE", k, loc, String(v).replaceAll(S_DUE, "{dueDate}"));
  }
  for (const v of ["PRODUCTION", "TEST", "SAMPLE", "OTHER"]) {
    put("ORDER_TYPE", v, loc, m.orderTypeLabelLocalized(v, loc));
  }
  for (const v of ["DIRECT_TO_USER", "NORMAL"]) {
    put("DELIVERY_METHOD", v, loc, m.deliveryMethodLabelLocalized(v, loc));
  }
  for (const v of ["REDUCED", "EXEMPT", "TAXABLE"]) {
    put("TAX", v, loc, m.taxLabelLocalized(v, loc));
  }
  put(
    "ATTN",
    "withBranch",
    loc,
    m.pdfAttnLine(loc, S_BRANCH).replaceAll(S_BRANCH, "{branchName}"),
  );
  put("ATTN", "contactOnly", loc, m.pdfAttnLine(loc, null));
}

fs.writeFileSync(
  OUT,
  JSON.stringify(
    { pdf: { file: "src/lib/pdf-labels.ts", entries: out } },
    null,
    2,
  ),
);
const incomplete = Object.entries(out).filter(([, v]) =>
  LOCALES.some((l) => v[l] === undefined),
);
console.log(`pdf entries: ${Object.keys(out).length}`);
console.log(`incomplete : ${incomplete.length}`);
for (const [k] of incomplete.slice(0, 5)) console.log(`   ${k}`);
