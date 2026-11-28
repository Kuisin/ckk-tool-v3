import { describe, expect, it } from "vitest";
import {
  docCompanyCode,
  matchesDocCompany,
  showsDocCompany,
} from "./doc-company-view-core";

const single = { multiCompany: false, homeCode: "CKK", names: {} };
const multi = { multiCompany: true, homeCode: "CKK", names: {} };

describe("doc-company-view-core", () => {
  it("2 社にまたがる人には、どの書類にも出す", () => {
    expect(showsDocCompany(multi, "CKK")).toBe(true);
    expect(showsDocCompany(multi, "TSP")).toBe(true);
  });

  it("1 社だけの人には、自分の法人の書類には出さない", () => {
    expect(showsDocCompany(single, "CKK")).toBe(false);
  });

  it("1 社だけの人でも、他社の書類には出す（全社スコープで見えている場合）", () => {
    expect(showsDocCompany(single, "TSP")).toBe(true);
  });

  it("法人の分からない書類・見ている人の情報が無いときは出さない", () => {
    expect(showsDocCompany(multi, null)).toBe(false);
    expect(showsDocCompany(null, "TSP")).toBe(false);
  });

  it("id・参照から法人コードを読む", () => {
    expect(docCompanyCode("TSP~QOT-2026-00001")).toBe("TSP");
    expect(docCompanyCode("CKK/ORD-2026-00003")).toBe("CKK");
    expect(docCompanyCode("QOT-202607-00001")).toBeNull();
    expect(docCompanyCode(null)).toBeNull();
  });

  it("検索は法人コードの頭に当てる（2 文字以上・大文字小文字を問わない）", () => {
    expect(matchesDocCompany("TSP", "tsp")).toBe(true);
    expect(matchesDocCompany("TSP", "TS")).toBe(true);
    expect(matchesDocCompany("TSP", "T")).toBe(false);
    expect(matchesDocCompany("TSP", "SP")).toBe(false);
    expect(matchesDocCompany(null, "TSP")).toBe(false);
  });
});
