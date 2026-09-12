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

import { documentFormatters } from "./format";
import { roundYen } from "./money";

/** UTF-8 BOM — 出力 CSV の先頭に必ず付与する。 */
export const YAYOI_CSV_BOM = "﻿";

/** 仕訳の勘定科目（最小構成の固定値）。 */
export const YAYOI_DEBIT_ACCOUNT = "売掛金";
export const YAYOI_CREDIT_ACCOUNT = "売上高";
export const YAYOI_TAX_ACCOUNT = "仮受消費税";

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
  /**
   * 消費税額（円）。指定時は 売上高（税抜）と 仮受消費税 の 2 行に分けて
   * 仕訳する（監査 P0-5 — 非課税/軽減税率の顧客でも正しい仕訳になる）。
   * 省略時は従来通り税込 1 行。
   */
  taxAmount?: number;
  /**
   * 税率ごとの内訳（適格請求書の区分記載）。製品ごとに課税区分を持てるように
   * なったので、1 通の請求書に 8% と 10% が同居する。指定すると**率ごとに**
   * 売上高 + 仮受消費税 の行を出し、摘要に率を書く（会計側で税率別に集計できる）。
   *
   * **列は増やさない。** 6 列の並びは弥生側の取込形式なので、税区分の列を勝手に
   * 足すと取込マッピングが壊れる。率は摘要と行の分かれ方で表す。
   *
   * 省略時は `taxAmount` を使った従来の出力と**1 バイトも変わらない**。
   */
  taxLines?: readonly TaxLineBreakdown[];
}

/** 税率 1 つ分の内訳。`taxableBase` はその率の対象となる税抜金額。 */
export interface TaxLineBreakdown {
  taxRate: number;
  taxableBase: number;
  taxAmount: number;
}

/**
 * CSV フィールドのエスケープ — カンマ・引用符・改行を含む場合はダブルクォート。
 *
 * 先頭が = + - @ / タブ / CR のセルは Excel が数式として実行する（CSV
 * インジェクション — 監査 L2）。取引先名は取引先マスタから来る文字列なので、
 * 先頭にアポストロフィを置いて文字列に固定する。数値は対象外
 * （負の金額 `-100` を `'-100` にすると仕訳が壊れる）。
 */
export function csvField(value: string | number): string {
  if (typeof value === "number") return String(value);
  const s = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * ISO 文字列 / Date → 弥生の日付形式 `yyyy/mm/dd`（**JST の暦日**）。
 * 帳票と同じ固定フォーマッタ（documentFormatters）を通す — ISO 文字列を
 * 切り出すと UTC の日付になり、JST 0〜9 時の発行が前日の仕訳になる。
 */
function yayoiDate(date: string | Date): string {
  return documentFormatters.date(date);
}

/**
 * 請求書 1 件 → 弥生会計 Next 仕訳インポート形式の最小 CSV。
 * ヘッダ行 + 仕訳 1 行（売掛金 / 売上高）。UTF-8 with BOM・CRLF。
 */
export function buildYayoiCsv(invoice: YayoiInvoiceInput): string {
  // 丸めは `lib/money.ts` の方針 1 本（請求書の作成時に既に整数円で確定して
  // いるので、ここは念のための同じ丸め = 値は動かない）。以前はここだけが
  // 独自に `Math.round` していて、合計を丸めていない PDF と 1 円ずれ得た。
  const amount = roundYen(invoice.totalAmount);
  const tax = roundYen(invoice.taxAmount ?? 0);
  const header = [
    "日付",
    "借方勘定科目",
    "借方金額",
    "貸方勘定科目",
    "貸方金額",
    "摘要",
  ];
  const memo = `${invoice.invoiceNumber} ${invoice.customerName}`;
  const date = yayoiDate(invoice.date);
  const rows: (string | number)[][] = [];

  // 税率ごとの内訳があるときは率ごとに仕訳する。
  // **Σ借方金額 = 税込合計**（崩れると弥生の取込でエラーになる）。
  if (invoice.taxLines && invoice.taxLines.length > 0) {
    // 率を摘要に書くのは**混在しているときだけ**。1 率しか無い請求書に書き足すと、
    // 既存の請求書を書き出し直したときに摘要だけが変わる（金額も行数も同じなのに
    // 差分が出る）。混在していなければ従来と 1 バイトも変わらないのが正しい。
    const mixed = invoice.taxLines.length > 1;
    for (const line of invoice.taxLines) {
      const base = roundYen(line.taxableBase);
      const lineTax = roundYen(line.taxAmount);
      const suffix = mixed
        ? ` ${Number((line.taxRate * 100).toFixed(4))}%`
        : "";
      if (base !== 0) {
        rows.push([
          date,
          YAYOI_DEBIT_ACCOUNT,
          base,
          YAYOI_CREDIT_ACCOUNT,
          base,
          `${memo}${suffix}`,
        ]);
      }
      if (lineTax !== 0) {
        rows.push([
          date,
          YAYOI_DEBIT_ACCOUNT,
          lineTax,
          YAYOI_TAX_ACCOUNT,
          lineTax,
          `${memo} 消費税${suffix.trim()}`,
        ]);
      }
    }
    const lines = [header, ...rows].map((cols) => cols.map(csvField).join(","));
    return `${YAYOI_CSV_BOM}${lines.join("\r\n")}\r\n`;
  }

  if (tax > 0) {
    // 売上（税抜）と仮受消費税に分離 — 借方は合計で売掛金
    rows.push([
      date,
      YAYOI_DEBIT_ACCOUNT,
      amount - tax,
      YAYOI_CREDIT_ACCOUNT,
      amount - tax,
      memo,
    ]);
    rows.push([
      date,
      YAYOI_DEBIT_ACCOUNT,
      tax,
      YAYOI_TAX_ACCOUNT,
      tax,
      `${memo} 消費税`,
    ]);
  } else {
    rows.push([
      date,
      YAYOI_DEBIT_ACCOUNT,
      amount,
      YAYOI_CREDIT_ACCOUNT,
      amount,
      memo,
    ]);
  }
  const lines = [header, ...rows].map((cols) => cols.map(csvField).join(","));
  return `${YAYOI_CSV_BOM}${lines.join("\r\n")}\r\n`;
}
