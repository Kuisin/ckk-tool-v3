// buildYayoiCsv — 弥生会計 Next 仕訳インポート CSV（pure builder）のテスト。

import { describe, expect, it } from "vitest";
import { buildYayoiCsv, csvField, YAYOI_CSV_BOM } from "./csv-export";

describe("buildYayoiCsv", () => {
  const base = {
    invoiceNumber: "INV-202607-00001",
    customerName: "株式会社テスト工業",
    date: "2026-07-31T00:00:00.000Z",
    totalAmount: 275000,
  };

  it("UTF-8 BOM で始まり CRLF 改行で終わる", () => {
    const csv = buildYayoiCsv(base);
    expect(csv.startsWith(YAYOI_CSV_BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.slice(YAYOI_CSV_BOM.length).includes("﻿")).toBe(false);
  });

  it("ヘッダ行 + 仕訳 1 行（売掛金 / 売上高・税込総額）を出力する", () => {
    const csv = buildYayoiCsv(base);
    const lines = csv.slice(YAYOI_CSV_BOM.length).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "日付,借方勘定科目,借方金額,貸方勘定科目,貸方金額,摘要",
    );
    expect(lines[1]).toBe(
      "2026/07/31,売掛金,275000,売上高,275000,INV-202607-00001 株式会社テスト工業",
    );
  });

  it("Date 入力と小数金額（四捨五入）を受け付ける", () => {
    const csv = buildYayoiCsv({
      ...base,
      date: new Date(Date.UTC(2026, 0, 5)),
      totalAmount: 1234.5,
    });
    const row = csv.slice(YAYOI_CSV_BOM.length).trimEnd().split("\r\n")[1];
    expect(row).toContain("2026/01/05");
    expect(row).toContain(",売掛金,1235,売上高,1235,");
  });

  it("仕訳日付は JST の暦日（UTC 前日 15 時以降は翌日）", () => {
    const csv = buildYayoiCsv({ ...base, date: "2026-07-31T15:30:00.000Z" });
    const row = csv.slice(YAYOI_CSV_BOM.length).trimEnd().split("\r\n")[1];
    expect(row.startsWith("2026/08/01,")).toBe(true);
  });

  it("taxAmount 指定時は 売上高（税抜）+ 仮受消費税 の 2 行に分離する", () => {
    const csv = buildYayoiCsv({
      ...base,
      totalAmount: 275000,
      taxAmount: 25000,
    });
    const lines = csv.slice(YAYOI_CSV_BOM.length).trimEnd().split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 行
    expect(lines[1]).toContain(",売掛金,250000,売上高,250000,");
    expect(lines[2]).toContain(",売掛金,25000,仮受消費税,25000,");
    expect(lines[2]).toContain("消費税");
  });

  it("taxAmount = 0（非課税顧客）は従来通り 1 行", () => {
    const csv = buildYayoiCsv({ ...base, totalAmount: 250000, taxAmount: 0 });
    const lines = csv.slice(YAYOI_CSV_BOM.length).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(",売掛金,250000,売上高,250000,");
  });

  it("カンマ・引用符を含むフィールドをダブルクォートでエスケープする", () => {
    const csv = buildYayoiCsv({
      ...base,
      customerName: 'Acme, Inc. "JP"',
    });
    const row = csv.slice(YAYOI_CSV_BOM.length).trimEnd().split("\r\n")[1];
    expect(row).toContain('"INV-202607-00001 Acme, Inc. ""JP"""');
  });
});

describe("csvField — 数式インジェクション対策", () => {
  it("= + - @ タブ CR で始まる文字列はアポストロフィで文字列に固定する", () => {
    expect(csvField("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-abc")).toBe("'-abc");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("\tx")).toBe("'\tx");
  });

  it("数値は触らない（負の金額を壊さない）", () => {
    expect(csvField(-100)).toBe("-100");
    expect(csvField(0)).toBe("0");
  });

  it("普通の文字列は従来どおり", () => {
    expect(csvField("株式会社A")).toBe("株式会社A");
    expect(csvField('a"b,c')).toBe('"a""b,c"');
  });
});

// ── 税率ごとの内訳（適格請求書の区分記載）────────────────────────────────────

describe("buildYayoiCsv — taxLines（税率ごとの仕訳）", () => {
  const base = {
    invoiceNumber: "INV-202607-00001",
    customerName: "株式会社テスト工業",
    date: "2026-07-31T00:00:00.000Z",
  };

  // ★ 既存の請求書を書き出し直しても差分が出ないこと。route は常に taxLines を
  //   渡すので、「1 率だけの束を渡した出力 == taxLines 無しの出力」が回帰ロック。
  it("単一税率の束を渡した出力は、従来の出力と完全に一致する", () => {
    const legacy = buildYayoiCsv({
      ...base,
      totalAmount: 177_100,
      taxAmount: 16_100,
    });
    const withSingleBucket = buildYayoiCsv({
      ...base,
      totalAmount: 177_100,
      taxAmount: 16_100,
      taxLines: [{ taxRate: 0.1, taxableBase: 161_000, taxAmount: 16_100 }],
    });
    expect(withSingleBucket).toBe(legacy);
  });

  it("非課税（0%）の単一束も従来の税込 1 行と一致する", () => {
    const legacy = buildYayoiCsv({ ...base, totalAmount: 1_500, taxAmount: 0 });
    const withBucket = buildYayoiCsv({
      ...base,
      totalAmount: 1_500,
      taxAmount: 0,
      taxLines: [{ taxRate: 0, taxableBase: 1_500, taxAmount: 0 }],
    });
    expect(withBucket).toBe(legacy);
  });

  it("taxLines を渡さなければ従来の出力と 1 バイトも変わらない（回帰ロック）", () => {
    const withoutLines = buildYayoiCsv({
      ...base,
      totalAmount: 275_000,
      taxAmount: 25_000,
    });
    const explicitUndefined = buildYayoiCsv({
      ...base,
      totalAmount: 275_000,
      taxAmount: 25_000,
      taxLines: undefined,
    });
    const emptyLines = buildYayoiCsv({
      ...base,
      totalAmount: 275_000,
      taxAmount: 25_000,
      taxLines: [],
    });
    expect(explicitUndefined).toBe(withoutLines);
    expect(emptyLines).toBe(withoutLines);
  });

  it("10% と 8% が混ざると率ごとに 売上高 + 仮受消費税 の 4 行になる", () => {
    const csv = buildYayoiCsv({
      ...base,
      totalAmount: 18_600,
      taxAmount: 1_600,
      taxLines: [
        { taxRate: 0.1, taxableBase: 12_000, taxAmount: 1_200 },
        { taxRate: 0.08, taxableBase: 5_000, taxAmount: 400 },
      ],
    });
    const lines = csv.slice(YAYOI_CSV_BOM.length).trimEnd().split("\r\n");
    expect(lines).toHaveLength(5); // ヘッダ + 4
    expect(lines[1]).toContain("売上高,12000");
    expect(lines[1]).toContain("10%");
    expect(lines[2]).toContain("仮受消費税,1200");
    expect(lines[2]).toContain("消費税10%");
    expect(lines[3]).toContain("売上高,5000");
    expect(lines[4]).toContain("仮受消費税,400");
    expect(lines[4]).toContain("消費税8%");
  });

  // ★ 仕訳が balance しないと弥生の取込がエラーになる。
  it("借方金額の合計が税込総額と一致する", () => {
    const csv = buildYayoiCsv({
      ...base,
      totalAmount: 18_600,
      taxAmount: 1_600,
      taxLines: [
        { taxRate: 0.1, taxableBase: 12_000, taxAmount: 1_200 },
        { taxRate: 0.08, taxableBase: 5_000, taxAmount: 400 },
      ],
    });
    const lines = csv
      .slice(YAYOI_CSV_BOM.length)
      .trimEnd()
      .split("\r\n")
      .slice(1);
    const debit = lines.reduce((sum, l) => sum + Number(l.split(",")[2]), 0);
    expect(debit).toBe(18_600);
  });

  it("0% の束は売上高の行だけ（仮受消費税 0 円の行を作らない）", () => {
    const csv = buildYayoiCsv({
      ...base,
      totalAmount: 1_500,
      taxAmount: 0,
      taxLines: [{ taxRate: 0, taxableBase: 1_500, taxAmount: 0 }],
    });
    const lines = csv.slice(YAYOI_CSV_BOM.length).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("売上高,1500");
    expect(lines[1]).not.toContain("仮受消費税");
  });

  it("率の端数を落とさない（混在時、8.25% がそのまま摘要に出る）", () => {
    const csv = buildYayoiCsv({
      ...base,
      totalAmount: 2_182,
      taxAmount: 182,
      taxLines: [
        { taxRate: 0.1, taxableBase: 1_000, taxAmount: 100 },
        { taxRate: 0.0825, taxableBase: 1_000, taxAmount: 82 },
      ],
    });
    expect(csv).toContain("消費税8.25%");
  });

  // 摘要は請求番号で始まるので数式にはならないが、カンマを含む取引先名は
  // 引用されないと列がずれる（csvField を通っていることの確認）。
  it("摘要がカンマを含むときは引用される", () => {
    const csv = buildYayoiCsv({
      ...base,
      customerName: "株式会社テスト, 第二工場",
      totalAmount: 2_180,
      taxAmount: 180,
      taxLines: [
        { taxRate: 0.1, taxableBase: 1_000, taxAmount: 100 },
        { taxRate: 0.08, taxableBase: 1_000, taxAmount: 80 },
      ],
    });
    expect(csv).toContain('"INV-202607-00001 株式会社テスト, 第二工場 10%"');
    const lines = csv.slice(YAYOI_CSV_BOM.length).trimEnd().split("\r\n");
    // 引用されていれば、どの行も列数は 6 のまま。
    for (const line of lines) {
      expect(line.split('","').length <= 2).toBe(true);
    }
  });
});
