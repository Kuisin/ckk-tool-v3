// 会計連携（仕訳 CSV）の組み立てのテスト。
//
// 旧 csv-export.test.ts（弥生会計 Next 向け）の表明をそのまま引き継いでいる。
// 仕訳の作り方は 1 ミリも変えていないので、**行数・金額・摘要は旧実装と同じ**で
// なければならない。違うのはセルが科目コードになったことと、列が設定で決まること。
import { describe, expect, it } from "vitest";
import {
  ACCOUNTING_FIELD_IDS,
  type AccountingExportSettings,
  accountingExportSettingsSchema,
  buildAccountingCsvText,
  buildJournalRows,
  conflictingTaxRates,
  csvField,
  DEFAULT_ACCOUNTING_EXPORT_SETTINGS,
  type JournalInvoiceInput,
  renderCell,
} from "./accounting-export-core";

/** 既定の設定に、経理が入れるはずの科目コードだけ埋めたもの。 */
const settings: AccountingExportSettings = {
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

const base: JournalInvoiceInput = {
  invoiceNumber: "INV-202607-00001",
  customerName: "株式会社テスト工業",
  date: "2026-07-31T00:00:00.000Z",
  totalAmount: 250_000,
};

/** 借方金額の合計 — 仕訳が balance しているかの検算。 */
function debitTotal(inv: JournalInvoiceInput, s = settings): number {
  return buildJournalRows(inv, s).reduce((sum, r) => sum + r.debit.amount, 0);
}

describe("buildJournalRows — 旧実装から変えていない部分", () => {
  it("税額を渡さなければ 1 行（税込）", () => {
    const rows = buildJournalRows(base, settings);
    expect(rows).toHaveLength(1);
    expect(rows[0].debit.amount).toBe(250_000);
    expect(rows[0].credit.amount).toBe(250_000);
    expect(rows[0].memo).toBe("INV-202607-00001 株式会社テスト工業");
  });

  it("税額があれば 売上 + 消費税 の 2 行に分かれる", () => {
    const rows = buildJournalRows(
      { ...base, totalAmount: 275_000, taxAmount: 25_000 },
      settings,
    );
    expect(rows.map((r) => r.debit.amount)).toEqual([250_000, 25_000]);
    expect(rows[1].memo).toBe("INV-202607-00001 株式会社テスト工業 消費税");
  });

  it("税額 0 は 1 行のまま（消費税行を出さない）", () => {
    const rows = buildJournalRows({ ...base, taxAmount: 0 }, settings);
    expect(rows).toHaveLength(1);
  });

  it("金額は roundYen で整数円に丸める", () => {
    const rows = buildJournalRows({ ...base, totalAmount: 1234.5 }, settings);
    expect(rows[0].debit.amount).toBe(1235);
  });

  it("日付は **JST の暦日**（UTC 切り出しにしない）", () => {
    // 2026-07-31T15:30Z = JST では 8/1 の 0:30。
    const rows = buildJournalRows(
      { ...base, date: "2026-07-31T15:30:00.000Z" },
      settings,
    );
    expect(
      renderCell(
        rows[0],
        1,
        { id: "x", field: "date", header: "日付" },
        settings,
      ),
    ).toBe("2026/08/01");
  });

  it("率の接尾辞は**混在しているときだけ**摘要に付く", () => {
    const single = buildJournalRows(
      {
        ...base,
        totalAmount: 275_000,
        taxLines: [{ taxRate: 0.1, taxableBase: 250_000, taxAmount: 25_000 }],
      },
      settings,
    );
    expect(single[0].memo).toBe("INV-202607-00001 株式会社テスト工業");
    expect(single[1].memo).toBe("INV-202607-00001 株式会社テスト工業 消費税");

    const mixed = buildJournalRows(
      {
        ...base,
        totalAmount: 18_600,
        taxLines: [
          { taxRate: 0.1, taxableBase: 12_000, taxAmount: 1_200 },
          { taxRate: 0.08, taxableBase: 5_000, taxAmount: 400 },
        ],
      },
      settings,
    );
    expect(mixed.map((r) => r.memo)).toEqual([
      "INV-202607-00001 株式会社テスト工業 10%",
      "INV-202607-00001 株式会社テスト工業 消費税10%",
      "INV-202607-00001 株式会社テスト工業 8%",
      "INV-202607-00001 株式会社テスト工業 消費税8%",
    ]);
  });

  it("1 束だけの taxLines は taxAmount だけ渡したときと同じ行になる", () => {
    const legacy = buildJournalRows(
      { ...base, totalAmount: 275_000, taxAmount: 25_000 },
      settings,
    );
    const bucket = buildJournalRows(
      {
        ...base,
        totalAmount: 275_000,
        taxAmount: 25_000,
        taxLines: [{ taxRate: 0.1, taxableBase: 250_000, taxAmount: 25_000 }],
      },
      settings,
    );
    expect(bucket.map((r) => [r.debit.amount, r.memo])).toEqual(
      legacy.map((r) => [r.debit.amount, r.memo]),
    );
  });

  it("taxLines が undefined / [] はどちらもヘッダの税額に落ちる", () => {
    const inv = { ...base, totalAmount: 275_000, taxAmount: 25_000 };
    const a = buildAccountingCsvText({ ...inv, taxLines: undefined }, settings);
    const b = buildAccountingCsvText({ ...inv, taxLines: [] }, settings);
    expect(a).toBe(b);
  });

  it("0% の束は消費税行を出さない", () => {
    const rows = buildJournalRows(
      {
        ...base,
        totalAmount: 250_000,
        taxLines: [{ taxRate: 0, taxableBase: 250_000, taxAmount: 0 }],
      },
      settings,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("sales");
  });

  it("端数のある税率（8.25%）は摘要で丸められない", () => {
    const rows = buildJournalRows(
      {
        ...base,
        taxLines: [
          { taxRate: 0.1, taxableBase: 1_000, taxAmount: 100 },
          { taxRate: 0.0825, taxableBase: 1_000, taxAmount: 83 },
        ],
      },
      settings,
    );
    expect(rows[2].memo).toContain("8.25%");
  });

  // ★ これが崩れると会計側の取込がエラーになる。
  it("Σ借方金額 = 税込合計（混在でも）", () => {
    expect(
      debitTotal({
        ...base,
        totalAmount: 18_600,
        taxLines: [
          { taxRate: 0.1, taxableBase: 12_000, taxAmount: 1_200 },
          { taxRate: 0.08, taxableBase: 5_000, taxAmount: 400 },
        ],
      }),
    ).toBe(18_600);
    expect(
      debitTotal({ ...base, totalAmount: 275_000, taxAmount: 25_000 }),
    ).toBe(275_000);
    expect(debitTotal(base)).toBe(250_000);
  });
});

describe("科目コードの解決順", () => {
  it("取引先マスタ → 設定の既定 → 空欄", () => {
    const withMaster = buildJournalRows(
      {
        ...base,
        receivableAccountCode: "1360",
        receivableSubAccountCode: "0123",
      },
      settings,
    )[0];
    expect(withMaster.debit.accountCode).toBe("1360");
    expect(withMaster.debit.subCode).toBe("0123");

    const withoutMaster = buildJournalRows(base, settings)[0];
    expect(withoutMaster.debit.accountCode).toBe("1350"); // 設定の既定
    expect(withoutMaster.debit.subCode).toBe(""); // 補助科目は既定を持たない

    const noDefault = buildJournalRows(
      base,
      DEFAULT_ACCOUNTING_EXPORT_SETTINGS,
    )[0];
    expect(noDefault.debit.accountCode).toBe("");
  });

  it("補助科目は customer_code へ落とさない（別の番号体系）", () => {
    const row = buildJournalRows(
      { ...base, customerCode: "C-0001" },
      settings,
    )[0];
    expect(row.debit.subCode).toBe("");
    expect(row.customerCode).toBe("C-0001");
  });

  it("消費税コードは 税区分マスタ → 税率別の既定 → 全体の既定", () => {
    const fromMaster = buildJournalRows(
      {
        ...base,
        taxLines: [
          { taxRate: 0.1, taxableBase: 1_000, taxAmount: 100, taxCode: "21" },
        ],
      },
      settings,
    );
    expect(fromMaster[1].credit.taxCode).toBe("21");

    const fromRule = buildJournalRows(
      {
        ...base,
        taxLines: [{ taxRate: 0.08, taxableBase: 1_000, taxAmount: 80 }],
      },
      settings,
    );
    expect(fromRule[1].credit.taxCode).toBe("13"); // 税率別ルール

    const fromGlobal = buildJournalRows(
      {
        ...base,
        taxLines: [{ taxRate: 0.05, taxableBase: 1_000, taxAmount: 50 }],
      },
      settings,
    );
    expect(fromGlobal[1].credit.taxCode).toBe("00"); // 全体の既定
  });

  it("貸方の科目は 売上行 / 消費税行 で別（税区分マスタが優先）", () => {
    const rows = buildJournalRows(
      {
        ...base,
        taxLines: [
          {
            taxRate: 0.1,
            taxableBase: 1_000,
            taxAmount: 100,
            salesAccountCode: "5100",
            taxAccountCode: "2190",
          },
        ],
      },
      settings,
    );
    expect(rows[0].credit.accountCode).toBe("5100");
    expect(rows[1].credit.accountCode).toBe("2190");
  });

  it("貸方に得意先の補助科目を複写しない", () => {
    const row = buildJournalRows(
      { ...base, receivableSubAccountCode: "0123" },
      settings,
    )[0];
    expect(row.credit.subCode).toBe("");
  });
});

describe("列レイアウト", () => {
  const rows = (s: AccountingExportSettings) => buildAccountingCsvText(base, s);

  it("既定は 13 列で、ヘッダ行 + 仕訳行", () => {
    const lines = rows(settings).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].split(",")).toHaveLength(13);
    expect(lines[0]).toBe(
      "伝票日付,借方科目コード,借方補助科目,借方部門,借方消費税,借方金額,貸方科目コード,貸方補助科目,貸方部門,貸方消費税,貸方金額,摘要,証憑番号",
    );
  });

  it("列を並べ替え・削除・重複させても行数と金額合計は動かない", () => {
    const reordered: AccountingExportSettings = {
      ...settings,
      columns: [
        { id: "a", field: "debitAmount", header: "借方" },
        { id: "b", field: "debitAmount", header: "借方(再)" },
        { id: "c", field: "date", header: "日付" },
      ],
    };
    const line = rows(reordered).trimEnd().split("\r\n")[1];
    expect(line).toBe("250000,250000,2026/07/31");
    expect(debitTotal(base, reordered)).toBe(250_000);
  });

  it("固定文字列の列を差し込める", () => {
    const withConstant: AccountingExportSettings = {
      ...settings,
      columns: [
        { id: "a", field: "constant", header: "区分", constant: "1" },
        { id: "b", field: "empty", header: "予備" },
        { id: "c", field: "rowIndex", header: "行番号" },
      ],
    };
    expect(rows(withConstant).trimEnd().split("\r\n")[1]).toBe("1,,1");
  });

  it("ヘッダ行を出さない設定では仕訳行だけになる", () => {
    const lines = rows({ ...settings, headerRow: false })
      .trimEnd()
      .split("\r\n");
    expect(lines).toHaveLength(1);
  });

  it("語彙の全項目が描画できる（enum に足して switch を忘れる事故を止める）", () => {
    const row = buildJournalRows(base, settings)[0];
    for (const field of ACCOUNTING_FIELD_IDS) {
      const cell = renderCell(
        row,
        1,
        { id: "x", field, header: "h", constant: "c" },
        settings,
      );
      expect(cell, field).toBeDefined();
    }
  });

  it("日付の書式と改行コードが設定で変わる", () => {
    const compact = rows({
      ...settings,
      dateFormat: "YYYYMMDD",
      newline: "lf",
      columns: [{ id: "a", field: "date", header: "日付" }],
      headerRow: false,
    });
    expect(compact).toBe("20260731\n");
    expect(
      rows({
        ...settings,
        dateFormat: "YY/MM/DD",
        columns: [{ id: "a", field: "date", header: "日付" }],
        headerRow: false,
      }).trimEnd(),
    ).toBe("26/07/31");
  });

  it("年月日を別の列に割れる", () => {
    const split = rows({
      ...settings,
      headerRow: false,
      columns: [
        { id: "y", field: "dateYear", header: "年" },
        { id: "m", field: "dateMonth", header: "月" },
        { id: "d", field: "dateDay", header: "日" },
      ],
    }).trimEnd();
    expect(split).toBe("2026,07,31");
  });

  it("金額の 3 桁区切りはカンマを含むので引用符が付く", () => {
    const grouped = rows({
      ...settings,
      amountStyle: "grouped",
      headerRow: false,
      columns: [{ id: "a", field: "debitAmount", header: "借方" }],
    }).trimEnd();
    expect(grouped).toBe('"250,000"');
  });
});

describe("csvField — 数式インジェクション対策", () => {
  it("= + - @ タブ で始まる文字列にアポストロフィを足す", () => {
    expect(csvField("=1+1")).toBe("'=1+1");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-cmd")).toBe("'-cmd");
    expect(csvField("@SUM")).toBe("'@SUM");
    // タブは先頭にアポストロフィが付くだけで、引用符では囲まれない
    // （囲む条件は " , CR LF のみ）— 旧実装と同じ。
    expect(csvField("\tx")).toBe("'\tx");
  });

  it("数値には触らない（負の金額を壊さない）", () => {
    expect(csvField(-100)).toBe("-100");
    expect(csvField(0)).toBe("0");
  });

  it("カンマ・引用符はエスケープする", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('a"b')).toBe('"a""b"');
  });

  it("quoteMode で囲み方が変わる", () => {
    expect(csvField("x", "all")).toBe('"x"');
    expect(csvField(100, "all")).toBe('"100"');
    expect(csvField("x", "all-text")).toBe('"x"');
    expect(csvField(100, "all-text")).toBe("100");
  });

  it("取引先名のカンマは摘要ごと引用符で囲まれる", () => {
    const line = buildAccountingCsvText(
      { ...base, customerName: "株式会社テスト, 工業" },
      {
        ...settings,
        headerRow: false,
        columns: [{ id: "m", field: "memo", header: "摘要" }],
      },
    ).trimEnd();
    expect(line).toBe('"INV-202607-00001 株式会社テスト, 工業"');
  });
});

describe("科目が定まらない束", () => {
  it("codeConflict の立った率を返す（ルートはこれで拒否する）", () => {
    expect(
      conflictingTaxRates({
        taxLines: [
          {
            taxRate: 0.1,
            taxableBase: 1_000,
            taxAmount: 100,
            codeConflict: true,
          },
          { taxRate: 0.08, taxableBase: 1_000, taxAmount: 80 },
        ],
      }),
    ).toEqual([0.1]);
    expect(conflictingTaxRates({ taxLines: undefined })).toEqual([]);
  });
});

describe("設定の検証", () => {
  it("既定の設定はそのまま通る", () => {
    expect(
      accountingExportSettingsSchema.safeParse(
        DEFAULT_ACCOUNTING_EXPORT_SETTINGS,
      ).success,
    ).toBe(true);
  });

  it("列が 0 本は拒否する", () => {
    expect(
      accountingExportSettingsSchema.safeParse({ ...settings, columns: [] })
        .success,
    ).toBe(false);
  });

  it("語彙に無い項目は拒否する", () => {
    expect(
      accountingExportSettingsSchema.safeParse({
        ...settings,
        columns: [{ id: "a", field: "nope", header: "x" }],
      }).success,
    ).toBe(false);
  });

  it("固定文字列の列は中身が要る（空だとただの空列と区別が付かない）", () => {
    expect(
      accountingExportSettingsSchema.safeParse({
        ...settings,
        columns: [{ id: "a", field: "constant", header: "x" }],
      }).success,
    ).toBe(false);
  });

  it("ファイル名の接尾辞にパス区切りを通さない", () => {
    expect(
      accountingExportSettingsSchema.safeParse({
        ...settings,
        filenameSuffix: "../etc",
      }).success,
    ).toBe(false);
  });
});
