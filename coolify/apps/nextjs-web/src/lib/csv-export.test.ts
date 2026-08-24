// buildYayoiCsv — 弥生会計 Next 仕訳インポート CSV（pure builder）のテスト。

import { describe, expect, it } from "vitest";
import { buildYayoiCsv, YAYOI_CSV_BOM } from "./csv-export";

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
