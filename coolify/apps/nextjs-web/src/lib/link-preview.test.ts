import { describe, expect, it } from "vitest";
import { genericPreviewTitle, resolvePreviewTarget } from "./link-preview";

describe("resolvePreviewTarget", () => {
  it("resolves document URLs (EST/PRC/QOT) to their permission code", () => {
    const t = resolvePreviewTarget(
      "https://app-dev.ckk-tool.co.jp/sales/price-lists/PRC-202607-00004",
    );
    expect(t).toEqual({
      kind: "price-list",
      // permissions.code は "price_list" — "sales" は実在しないコード
      // （以前はここが "sales" のままで、権限判定が常に false になっていた）。
      permissionCode: "price_list",
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

  it("resolves order-acceptance/work-order/delivery/invoice URLs (ORD/WOR/DOR/DRN/INV)", () => {
    expect(
      resolvePreviewTarget("/sales/order-acceptances/ORD-202607-00001"),
    ).toEqual({
      kind: "order-acceptance",
      permissionCode: "order_acceptance",
      label: "注文請書",
      docNumber: "ORD-202607-00001",
      docKey: { yearMonth: "202607", seq: 1 },
    });
    expect(
      resolvePreviewTarget("/production/work-orders/WOR-202607-00002"),
    ).toEqual({
      kind: "work-order",
      permissionCode: "work_order",
      label: "指示書",
      docNumber: "WOR-202607-00002",
      docKey: { yearMonth: "202607", seq: 2 },
    });
    expect(
      resolvePreviewTarget("/shipping/delivery-orders/DOR-202607-00003")?.kind,
    ).toBe("delivery-order");
    expect(
      resolvePreviewTarget("/shipping/delivery-notes/DRN-202607-00004")?.kind,
    ).toBe("delivery-note");
    expect(resolvePreviewTarget("/billing/invoices/INV-202607-00005")).toEqual({
      kind: "invoice",
      permissionCode: "invoice",
      label: "請求書",
      docNumber: "INV-202607-00005",
      docKey: { yearMonth: "202607", seq: 5 },
    });
  });

  it("resolves number-column URLs (PO/PRQ/DSG) without a docKey", () => {
    expect(
      resolvePreviewTarget("/purchase/purchase-orders/PO-202607-00001"),
    ).toEqual({
      kind: "purchase-order",
      permissionCode: "purchase_order",
      label: "素材発注書",
      docNumber: "PO-202607-00001",
    });
    expect(
      resolvePreviewTarget("/purchase/purchase-requests/PRQ-202607-00002")
        ?.kind,
    ).toBe("purchase-request");
    expect(
      resolvePreviewTarget("/sales/design-requests/DSG-202607-00003"),
    ).toEqual({
      kind: "design-request",
      permissionCode: "design_request",
      label: "設計依頼書",
      docNumber: "DSG-202607-00003",
    });
  });

  it("resolves master URLs (int id)", () => {
    const t = resolvePreviewTarget(
      "https://app.ckk-tool.co.jp/master/products/42",
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
