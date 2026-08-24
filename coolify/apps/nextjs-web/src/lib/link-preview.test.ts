import { describe, expect, it } from "vitest";
import { genericPreviewTitle, resolvePreviewTarget } from "./link-preview";

describe("resolvePreviewTarget", () => {
  it("resolves document URLs (EST/PRC/QOT) to their permission code", () => {
    const t = resolvePreviewTarget(
      "https://ckk-dev.kai-lab.net/sales/price-lists/PRC-202607-00004",
    );
    expect(t).toEqual({
      kind: "price-list",
      permissionCode: "sales",
      label: "価格表",
      docNumber: "PRC-202607-00004",
      docKey: { yearMonth: "202607", seq: 4 },
    });

    expect(
      resolvePreviewTarget("/sales/trial-estimates/EST-202607-00001")?.kind,
    ).toBe("trial-estimate");
    expect(resolvePreviewTarget("/sales/quotes/QOT-202607-00002")?.kind).toBe(
      "quote",
    );
  });

  it("resolves master URLs (int id)", () => {
    const t = resolvePreviewTarget(
      "https://ckk.kai-lab.net/master/products/42",
    );
    expect(t).toEqual({
      kind: "product",
      permissionCode: "master",
      label: "製品",
      id: 42,
    });
    expect(resolvePreviewTarget("/master/material-types/7")?.kind).toBe(
      "material-type",
    );
    expect(resolvePreviewTarget("/master/materials/9")?.kind).toBe("material");
  });

  it("rejects prefix mismatch, non-detail paths and junk", () => {
    // 番号の接頭辞が画面と食い違う URL は対象外
    expect(
      resolvePreviewTarget("/sales/price-lists/EST-202607-00001"),
    ).toBeNull();
    expect(resolvePreviewTarget("/sales/price-lists")).toBeNull();
    expect(
      resolvePreviewTarget("/sales/price-lists/PRC-202607-00004/edit"),
    ).toBeNull();
    expect(resolvePreviewTarget("/master/products/abc")).toBeNull();
    expect(resolvePreviewTarget("/master/products/0")).toBeNull();
    expect(resolvePreviewTarget("not a url")).toBeNull();
    expect(resolvePreviewTarget("/settings")).toBeNull();
  });

  it("URL-encoded ids are decoded before parsing", () => {
    const plain = resolvePreviewTarget("/sales/quotes/QOT-202607-00002");
    const encoded = resolvePreviewTarget("/sales/quotes/QOT%2D202607%2D00002");
    expect(encoded).toEqual(plain);
    expect(plain?.kind).toBe("quote");
  });
});

describe("genericPreviewTitle", () => {
  it("never includes business data — only 文書種別 + 番号 / id", () => {
    const doc = resolvePreviewTarget("/sales/quotes/QOT-202607-00002");
    const master = resolvePreviewTarget("/master/products/42");
    expect(doc && genericPreviewTitle(doc)).toBe("見積書 QOT-202607-00002");
    expect(master && genericPreviewTitle(master)).toBe("製品 #42");
  });
});
