import { describe, expect, it } from "vitest";
import { docFields, relatedDocNumber } from "./doc-fields";

describe("docFields — /api/v1 の書類が共通で持つ番号まわりの項目", () => {
  it("参照から番号と法人コードを分けて返す", () => {
    expect(
      docFields({
        id: "0b0e7c1e-0000-4000-8000-000000000001",
        docRef: "CKK/QOT-2026-00001",
        fiscalYear: 2026,
        legacyNumber: "QOT-202607-00001",
      }),
    ).toEqual({
      id: "0b0e7c1e-0000-4000-8000-000000000001",
      number: "QOT-2026-00001",
      companyCode: "CKK",
      fiscalYear: 2026,
      docNumber: "QOT-2026-00001",
      legacyNumber: "QOT-202607-00001",
    });
  });

  it("同じ番号でも法人が違えば companyCode で見分けられる", () => {
    const a = docFields({
      id: "a",
      docRef: "CKK/INV-2026-00001",
      fiscalYear: 2026,
      legacyNumber: null,
    });
    const b = docFields({
      id: "b",
      docRef: "SUB/INV-2026-00001",
      fiscalYear: 2026,
      legacyNumber: null,
    });
    expect(a.number).toBe(b.number);
    expect(a.companyCode).not.toBe(b.companyCode);
    expect(a.legacyNumber).toBeNull();
  });

  it("number に法人コードを混ぜない（人に見せる姿のまま）", () => {
    const d = docFields({
      id: "x",
      docRef: "CKK/WOR-2026-00012",
      fiscalYear: 2026,
      legacyNumber: null,
    });
    expect(d.number).not.toContain("CKK");
    expect(d.docNumber).toBe(d.number);
  });
});

describe("relatedDocNumber — 関係の先の番号", () => {
  it("関係があれば番号だけを返す", () => {
    expect(relatedDocNumber({ docRef: "CKK/DOR-2026-00003" })).toBe(
      "DOR-2026-00003",
    );
  });

  it("関係が無ければ null", () => {
    expect(relatedDocNumber(null)).toBeNull();
    expect(relatedDocNumber(undefined)).toBeNull();
  });
});
