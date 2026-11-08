/**
 * accounting-documents-core.ts — 会計文書の明細行の純粋な変換だけを持つ。
 *
 * `lib/accounting-documents.ts`（server-only。DB・authz・next-intl に触れる）
 * から**この 1 関数だけ**切り出してある — `-core.ts` へ分けるのはこのリポジトリ
 * の規約（`accounting-export-core.ts` / `tax-rate.ts` などと同じ）で、DB 非依存
 * にしておくとラウンドトリップの単体テストが素の import だけで書ける
 * （server-only 側を import すると next-auth 経由で `next/server` を辿り、
 * vitest がモジュール解決に失敗する）。
 */

import type { JournalRow } from "./accounting-export-core";

/**
 * 保存済み明細行の平らな形（Decimal を Number に変換済み）。DB から読んだ
 * 直後（`fetchActiveAccountingDocument`）だけが `Decimal` → `number` の変換
 * をし、それより内側は普通の数値しか扱わない。
 */
export interface PersistedJournalLine {
  kind: string;
  taxRate: number;
  debitAccountCode: string;
  debitSubCode: string;
  debitDeptCode: string;
  debitTaxCode: string;
  debitAmount: number;
  creditAccountCode: string;
  creditSubCode: string;
  creditDeptCode: string;
  creditTaxCode: string;
  creditAmount: number;
  memo: string;
}

/**
 * 保存済みの明細行 → `renderJournalCsv` に渡せる `JournalRow`。日付・伝票番号・
 * 顧客名/コードは行ではなく文書（元請求書）が持つので引数で渡す。
 */
export function lineToJournalRow(
  line: PersistedJournalLine,
  ctx: {
    date: string | Date;
    invoiceNumber: string;
    customerCode: string;
    customerName: string;
    slipNo: string;
  },
): JournalRow {
  return {
    kind: line.kind === "tax" ? "tax" : "sales",
    date: ctx.date,
    taxRate: line.taxRate,
    debit: {
      accountCode: line.debitAccountCode,
      subCode: line.debitSubCode,
      deptCode: line.debitDeptCode,
      taxCode: line.debitTaxCode,
      amount: line.debitAmount,
    },
    credit: {
      accountCode: line.creditAccountCode,
      subCode: line.creditSubCode,
      deptCode: line.creditDeptCode,
      taxCode: line.creditTaxCode,
      amount: line.creditAmount,
    },
    memo: line.memo,
    voucherNo: ctx.invoiceNumber,
    invoiceNumber: ctx.invoiceNumber,
    customerCode: ctx.customerCode,
    customerName: ctx.customerName,
    slipNo: ctx.slipNo,
  };
}
