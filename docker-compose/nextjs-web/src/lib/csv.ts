/**
 * csv.ts — 依存なしの最小 CSV パーサ / シリアライザ（Excel 互換）。
 *
 * ルックアップ表のインポート（CSV）・テンプレート出力に使う。RFC4180 準拠の
 * ダブルクオート・エスケープ（""）・CRLF/LF・カンマ改行を含むフィールドに対応。
 */

/** CSV テキスト → 行×列の二次元配列。空行は無視。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // trailing field / row
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }
  return rows;
}

const needsQuote = (s: string) => /[",\r\n]/.test(s);
const quoteField = (s: string) =>
  needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s;

/** 行×列 → CSV テキスト（CRLF 改行・Excel 互換）。 */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) => r.map((f) => quoteField(String(f))).join(","))
    .join("\r\n");
}

/** ブラウザで CSV をダウンロードさせる（BOM 付きで Excel の文字化けを防止）。 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
