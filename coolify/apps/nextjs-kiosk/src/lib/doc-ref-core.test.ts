import { describe, expect, it } from "vitest";
import {
  docRef,
  docRefCompany,
  docRefNumber,
  docUrlId,
  isDocNumber,
  isDocRef,
  parseDocId,
  parseDocRef,
} from "./doc-ref-core";

describe("doc-ref-core", () => {
  it("builds and parses the stored form", () => {
    expect(docRef("CKK", "QOT-2026-00001")).toBe("CKK/QOT-2026-00001");
    expect(parseDocRef("CKK/QOT-2026-00001")).toEqual({
      companyCode: "CKK",
      number: "QOT-2026-00001",
    });
    // 注文明細（枝番つき）も同じ
    expect(parseDocRef("TSP/ORD-202607-00001-02")).toEqual({
      companyCode: "TSP",
      number: "ORD-202607-00001-02",
    });
  });

  it("round-trips", () => {
    for (const [c, n] of [
      ["CKK", "INV-202607-00012"],
      ["T-1", "PO-202607-00001"],
    ]) {
      expect(parseDocRef(docRef(c, n))).toEqual({ companyCode: c, number: n });
    }
  });

  it("a bare number is not a ref", () => {
    expect(parseDocRef("QOT-2026-00001")).toBeNull();
    expect(isDocRef("QOT-2026-00001")).toBe(false);
    expect(isDocRef("CKK/QOT-2026-00001")).toBe(true);
    expect(parseDocRef("/QOT-2026-00001")).toBeNull();
    expect(parseDocRef("CKK/")).toBeNull();
  });

  it("rejects parts that would make the ref ambiguous", () => {
    expect(() => docRef("", "QOT-1")).toThrow();
    expect(() => docRef("C/K", "QOT-1")).toThrow();
    expect(() => docRef("C~K", "QOT-1")).toThrow();
    expect(() => docRef("C K", "QOT-1")).toThrow();
    expect(() => docRef("CKK", "")).toThrow();
    expect(() => docRef("CKK", "A/B")).toThrow();
  });

  it("parseDocId reads the stored form, the URL form and a bare number", () => {
    expect(parseDocId("CKK/QOT-2026-00001")).toEqual({
      companyCode: "CKK",
      number: "QOT-2026-00001",
    });
    expect(parseDocId(docUrlId("CKK", "QOT-2026-00001"))).toEqual({
      companyCode: "CKK",
      number: "QOT-2026-00001",
    });
    expect(parseDocId(" QOT-2026-00001 ")).toEqual({
      companyCode: null,
      number: "QOT-2026-00001",
    });
  });

  it("isDocNumber tells document numbers from other ids", () => {
    expect(isDocNumber("QOT-202607-00001")).toBe(true);
    expect(isDocNumber("QOT-2026-00001")).toBe(true);
    expect(isDocNumber("ORD-202607-00001-02")).toBe(true);
    expect(isDocNumber("PO-202607-00001")).toBe(true);
    expect(isDocNumber("4711")).toBe(false);
    expect(isDocNumber("3f2b8c1e-0d4a-4f6b-9a57-1c2d3e4f5a6b")).toBe(false);
    expect(isDocNumber("CKK/QOT-202607-00001")).toBe(false);
  });

  it("docRefNumber / docRefCompany", () => {
    expect(docRefNumber("CKK/QOT-2026-00001")).toBe("QOT-2026-00001");
    expect(docRefNumber("QOT-2026-00001")).toBe("QOT-2026-00001");
    expect(docRefCompany("CKK/QOT-2026-00001")).toBe("CKK");
    expect(docRefCompany("QOT-2026-00001")).toBeNull();
  });
});
