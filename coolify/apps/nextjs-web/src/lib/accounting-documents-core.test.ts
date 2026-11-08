// lineToJournalRow — 保存済みの明細行を JournalRow へ戻す純粋関数のテスト。
//
// 会計文書（accounting_documents）は転記時に buildJournalRows(...) の結果を
// そのまま DB へ固定する。再ダウンロードは「その固定した行を戻して
// renderJournalCsv に渡す」だけで、buildJournalRows は二度と呼ばない —
// このラウンドトリップがバイト単位で元と同じ CSV を作れることがこの分離の
// 正しさそのもの。
import { describe, expect, it } from "vitest";
import {
  lineToJournalRow,
  type PersistedJournalLine,
} from "./accounting-documents-core";
import {
  buildAccountingCsvText,
  buildJournalRows,
  DEFAULT_ACCOUNTING_EXPORT_SETTINGS,
  type JournalInvoiceInput,
  renderJournalCsv,
} from "./accounting-export-core";

const settings = {
  ...DEFAULT_ACCOUNTING_EXPORT_SETTINGS,
  accounts: {
    receivableAccountCode: "1350",
    salesAccountCode: "5000",
    taxAccountCode: "2180",
    deptCode: "",
    taxCode: "00",
  },
  taxCodeRules: [
    { taxRate: 0.1, debitTaxCode: "00", creditTaxCode: "11" },
    { taxRate: 0.08, debitTaxCode: "00", creditTaxCode: "13" },
  ],
};

const invoice: JournalInvoiceInput = {
  invoiceNumber: "INV-202607-00001",
  customerName: "株式会社テスト工業",
  customerCode: "C-0001",
  slipNo: 1,
  date: "2026-07-31T00:00:00.000Z",
  totalAmount: 18_600,
  taxLines: [
    { taxRate: 0.1, taxableBase: 12_000, taxAmount: 1_200 },
    { taxRate: 0.08, taxableBase: 5_000, taxAmount: 400 },
  ],
};

/** JournalRow → 保存する形（Decimal は無いので Number のまま）。 */
function toPersisted(
  row: ReturnType<typeof buildJournalRows>[number],
): PersistedJournalLine {
  return {
    kind: row.kind,
    taxRate: row.taxRate,
    debitAccountCode: row.debit.accountCode,
    debitSubCode: row.debit.subCode,
    debitDeptCode: row.debit.deptCode,
    debitTaxCode: row.debit.taxCode,
    debitAmount: row.debit.amount,
    creditAccountCode: row.credit.accountCode,
    creditSubCode: row.credit.subCode,
    creditDeptCode: row.credit.deptCode,
    creditTaxCode: row.credit.taxCode,
    creditAmount: row.credit.amount,
    memo: row.memo,
  };
}

describe("lineToJournalRow — 保存済み行のラウンドトリップ", () => {
  it("buildJournalRows → 保存 → lineToJournalRow → renderJournalCsv がバイト単位で元と同じ", () => {
    const original = buildJournalRows(invoice, settings);
    const restored = original.map((row) =>
      lineToJournalRow(toPersisted(row), {
        date: invoice.date,
        invoiceNumber: invoice.invoiceNumber,
        customerCode: invoice.customerCode ?? "",
        customerName: invoice.customerName,
        slipNo: String(invoice.slipNo),
      }),
    );

    const expected = buildAccountingCsvText(invoice, settings);
    expect(renderJournalCsv(restored, settings)).toBe(expected);
  });

  it("行の科目コード・金額・摘要は 1 対 1 で復元される", () => {
    const [row] = buildJournalRows(invoice, settings);
    const restored = lineToJournalRow(toPersisted(row), {
      date: invoice.date,
      invoiceNumber: invoice.invoiceNumber,
      customerCode: "C-0001",
      customerName: invoice.customerName,
      slipNo: "1",
    });
    expect(restored.debit).toEqual(row.debit);
    expect(restored.credit).toEqual(row.credit);
    expect(restored.memo).toBe(row.memo);
    expect(restored.taxRate).toBe(row.taxRate);
    expect(restored.kind).toBe(row.kind);
  });

  it("kind が 'tax' 以外の未知の値でも 'sales' へ落ちる（保存データの防御）", () => {
    const restored = lineToJournalRow(
      {
        kind: "unexpected",
        taxRate: 0.1,
        debitAccountCode: "1350",
        debitSubCode: "",
        debitDeptCode: "",
        debitTaxCode: "00",
        debitAmount: 100,
        creditAccountCode: "5000",
        creditSubCode: "",
        creditDeptCode: "",
        creditTaxCode: "11",
        creditAmount: 100,
        memo: "test",
      },
      {
        date: "2026-07-31",
        invoiceNumber: "INV-202607-00001",
        customerCode: "",
        customerName: "test",
        slipNo: "1",
      },
    );
    expect(restored.kind).toBe("sales");
  });
});
