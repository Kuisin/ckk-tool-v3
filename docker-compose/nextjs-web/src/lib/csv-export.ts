/**
 * csv-export.ts — 弥生会計 Next 仕訳インポート CSV 生成（§9 会計連携）。
 *
 * pure builder のみ（DB・Next.js 非依存）— vitest でテスト可能。
 * 実際のダウンロードは app/api/export/yayoi/route.ts が担う。
 *
 * 最小構成の仕訳 CSV: 1 請求書 = 1 仕訳行（借方: 売掛金 / 貸方: 売上高、税込総額）。
 *   列: 日付, 借方勘定科目, 借方金額, 貸方勘定科目, 貸方金額, 摘要
 *
 * 文字コード: 弥生会計 Next は UTF-8（BOM 付き）の取込に対応しているため、
 * Shift_JIS への変換は行わず UTF-8 with BOM で出力する（BOM は Excel での
 * 文字化け防止も兼ねる）。改行は CRLF。
 */

/** UTF-8 BOM — 出力 CSV の先頭に必ず付与する。 */
export const YAYOI_CSV_BOM = "﻿";

/** 仕訳の勘定科目（最小構成の固定値）。 */
export const YAYOI_DEBIT_ACCOUNT = "売掛金";
export const YAYOI_CREDIT_ACCOUNT = "売上高";

/** buildYayoiCsv の入力 — 請求書から必要最小限のフィールドのみ。 */
export interface YayoiInvoiceInput {
  /** 導出文書番号 INV-YYYYMM-NNNNN。 */
  invoiceNumber: string;
  /** 顧客名（ja）。 */
  customerName: string;
  /** 仕訳日付 = 発行日（未発行時は呼び出し側で作成日等を渡す）。ISO 文字列 or Date。 */
  date: string | Date;
  /** 税込総額（円）。 */
  totalAmount: number;
}

/** CSV フィールドのエスケープ — カンマ・引用符・改行を含む場合はダブルクォート。 */
function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** ISO 文字列 / Date → 弥生の日付形式 `yyyy/mm/dd`。 */
function yayoiDate(date: string | Date): string {
  const iso = date instanceof Date ? date.toISOString() : date;
  return iso.slice(0, 10).replace(/-/g, "/");
}

/**
 * 請求書 1 件 → 弥生会計 Next 仕訳インポート形式の最小 CSV。
 * ヘッダ行 + 仕訳 1 行（売掛金 / 売上高）。UTF-8 with BOM・CRLF。
 */
export function buildYayoiCsv(invoice: YayoiInvoiceInput): string {
  const amount = Math.round(invoice.totalAmount);
  const header = [
    "日付",
    "借方勘定科目",
    "借方金額",
    "貸方勘定科目",
    "貸方金額",
    "摘要",
  ];
  const row = [
    yayoiDate(invoice.date),
    YAYOI_DEBIT_ACCOUNT,
    amount,
    YAYOI_CREDIT_ACCOUNT,
    amount,
    `${invoice.invoiceNumber} ${invoice.customerName}`,
  ];
  const lines = [header, row].map((cols) => cols.map(csvField).join(","));
  return `${YAYOI_CSV_BOM}${lines.join("\r\n")}\r\n`;
}
