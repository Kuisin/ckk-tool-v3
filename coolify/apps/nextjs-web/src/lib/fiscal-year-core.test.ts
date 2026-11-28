import { describe, expect, it } from "vitest";
import { fiscalYearOf, formatDocNumber, jstDate } from "./fiscal-year-core";

// 同じ表を shared-db/ci/sql-tests/document-sequences.sql が DB 関数に当てている。
// 片方だけ直すと双子が割れるので、行を足すときは両方に足す。

describe("jstDate", () => {
  it("UTC 15:00 は日本時間の翌日", () => {
    expect(jstDate(new Date("2027-03-31T15:00:00Z"))).toBe("2027-04-01");
    expect(jstDate(new Date("2027-03-31T14:59:59Z"))).toBe("2027-03-31");
  });
  it("年またぎ", () => {
    expect(jstDate(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });
  it("不正な日付は拒否", () => {
    expect(() => jstDate(new Date("x"))).toThrow(RangeError);
  });
});

describe("fiscalYearOf", () => {
  const cases: [number, string, number][] = [
    // 4 月始まり（CKK・TSP）
    [4, "2026-04-01", 2026],
    [4, "2027-03-31", 2026],
    [4, "2027-04-01", 2027],
    [4, "2026-12-31", 2026],
    [4, "2027-01-01", 2026],
    // 1 月始まり = 暦年
    [1, "2026-01-01", 2026],
    [1, "2026-12-31", 2026],
    // 12 月始まり — 12 月だけがその年、1〜11 月は前年
    [12, "2026-12-01", 2026],
    [12, "2026-11-30", 2025],
    [12, "2027-01-01", 2026],
  ];
  it.each(cases)("開始月 %i / %s → %i", (start, date, fy) => {
    expect(fiscalYearOf(start, date)).toBe(fy);
  });

  it("時刻は日本時間の暦日で切る（3/31 15:00Z = 4/1 JST）", () => {
    expect(fiscalYearOf(4, new Date("2027-03-31T15:00:00Z"))).toBe(2027);
    expect(fiscalYearOf(4, new Date("2027-03-31T14:59:59Z"))).toBe(2026);
  });

  it("開始月の範囲外・形の違う日付は拒否", () => {
    expect(() => fiscalYearOf(0, "2026-04-01")).toThrow(RangeError);
    expect(() => fiscalYearOf(13, "2026-04-01")).toThrow(RangeError);
    expect(() => fiscalYearOf(4.5, "2026-04-01")).toThrow(RangeError);
    expect(() => fiscalYearOf(4, "2026/04/01")).toThrow(RangeError);
  });
});

describe("formatDocNumber", () => {
  it("PREFIX-FFFF-NNNNN", () => {
    expect(formatDocNumber("QOT", 2026, 1)).toBe("QOT-2026-00001");
    expect(formatDocNumber("PO", 2026, 99999)).toBe("PO-2026-99999");
    expect(formatDocNumber("INV", 2027, 123)).toBe("INV-2027-00123");
  });
  it("形を外れる入力は拒否", () => {
    expect(() => formatDocNumber("qot", 2026, 1)).toThrow(RangeError);
    expect(() => formatDocNumber("QOTXX", 2026, 1)).toThrow(RangeError);
    expect(() => formatDocNumber("QOT", 999, 1)).toThrow(RangeError);
    expect(() => formatDocNumber("QOT", 2026, 0)).toThrow(RangeError);
    expect(() => formatDocNumber("QOT", 2026, 100000)).toThrow(RangeError);
  });
});
