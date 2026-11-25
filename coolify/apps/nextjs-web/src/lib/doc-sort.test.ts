import { describe, expect, it } from "vitest";
import { docSortValue } from "./doc-sort";

const sorted = (ids: (string | null)[]) =>
  [...ids].sort((a, b) => {
    const av = docSortValue(a);
    const bv = docSortValue(b);
    return av < bv ? -1 : av > bv ? 1 : 0;
  });

describe("docSortValue", () => {
  it("会計年度 → 年度内連番の順（法人コードは後）", () => {
    expect(
      sorted([
        "TSP~QOT-2026-00002",
        "CKK~QOT-2027-00001",
        "CKK~QOT-2026-00010",
        "TSP~QOT-2026-00001",
      ]),
    ).toEqual([
      "TSP~QOT-2026-00001",
      "TSP~QOT-2026-00002",
      "CKK~QOT-2026-00010",
      "CKK~QOT-2027-00001",
    ]);
  });

  it("同じ番号が 2 つの法人にあるときは法人コードで分ける", () => {
    expect(sorted(["TSP~PO-2026-00001", "CKK~PO-2026-00001"])).toEqual([
      "CKK~PO-2026-00001",
      "TSP~PO-2026-00001",
    ]);
  });

  it("参照の姿・注文明細・番号なしも扱える", () => {
    expect(docSortValue("CKK/ORD-2026-00003-02")).toBe(
      "ORD-2026-00003-02\u0000CKK",
    );
    expect(docSortValue(null)).toBe("");
    expect(docSortValue("9001")).toBe("9001\u0000");
  });
});
