import { describe, expect, it } from "vitest";
import { genericPreviewTitle, resolvePreviewTarget } from "./link-preview";

describe("resolvePreviewTarget", () => {
  it("resolves document URLs (EST/PRC/QOT) to their permission code", () => {
    const t = resolvePreviewTarget(
      "https://app-dev.ckk-tool.co.jp/sales/price-lists/CKK~PRC-2026-00004",
    );
    expect(t).toEqual({
      kind: "price-list",
      // permissions.code は "price_list" — "sales" は実在しないコード
      // （以前はここが "sales" のままで、権限判定が常に false になっていた）。
      permissionCode: "price_list",
      label: "価格表",
      table: "price_list_entries",
      docNumber: "PRC-2026-00004",
      docKey: { docRef: "CKK/PRC-2026-00004" },
      rawId: "CKK~PRC-2026-00004",
    });

    expect(
      resolvePreviewTarget("/sales/trial-estimates/CKK~EST-2026-00001")?.kind,
    ).toBe("trial-estimate");
    expect(resolvePreviewTarget("/sales/quotes/CKK~QOT-2026-00002")?.kind).toBe(
      "quote",
    );
  });

  it("resolves order-acceptance/work-order/delivery/invoice URLs (ORD/WOR/DOR/DRN/INV)", () => {
    expect(
      resolvePreviewTarget("/sales/order-acceptances/SUB~ORD-2026-00001"),
    ).toEqual({
      kind: "order-acceptance",
      permissionCode: "order_acceptance",
      label: "注文請書",
      table: "order_acceptances",
      docNumber: "ORD-2026-00001",
      docKey: { docRef: "SUB/ORD-2026-00001" },
      rawId: "SUB~ORD-2026-00001",
    });
    expect(
      resolvePreviewTarget("/production/work-orders/CKK~WOR-2026-00002"),
    ).toMatchObject({
      kind: "work-order",
      permissionCode: "work_order",
      table: "work_orders",
      docNumber: "WOR-2026-00002",
      docKey: { docRef: "CKK/WOR-2026-00002" },
    });
    // ロット番号で開く指示書の URL は対象外のまま
    expect(resolvePreviewTarget("/production/work-orders/4711")).toBeNull();
    expect(
      resolvePreviewTarget("/shipping/delivery-orders/CKK~DOR-2026-00003")
        ?.kind,
    ).toBe("delivery-order");
    expect(
      resolvePreviewTarget("/shipping/delivery-notes/CKK~DRN-2026-00004")?.kind,
    ).toBe("delivery-note");
    expect(
      resolvePreviewTarget("/billing/invoices/CKK~INV-2026-00005"),
    ).toMatchObject({
      kind: "invoice",
      permissionCode: "invoice",
      label: "請求書",
      table: "invoices",
      docKey: { docRef: "CKK/INV-2026-00005" },
    });
  });

  it("resolves PO/PRQ/DSG URLs the same way (番号は DB が払い出す書類)", () => {
    expect(
      resolvePreviewTarget("/purchase/purchase-orders/CKK~PO-2026-00001"),
    ).toEqual({
      kind: "purchase-order",
      permissionCode: "purchase_order",
      label: "素材発注書",
      table: "material_purchase_orders",
      docNumber: "PO-2026-00001",
      docKey: { docRef: "CKK/PO-2026-00001" },
      rawId: "CKK~PO-2026-00001",
    });
    expect(
      resolvePreviewTarget("/purchase/purchase-requests/CKK~PRQ-2026-00002")
        ?.kind,
    ).toBe("purchase-request");
    expect(
      resolvePreviewTarget("/sales/design-requests/CKK~DSG-2026-00003"),
    ).toMatchObject({
      kind: "design-request",
      permissionCode: "design_request",
      label: "設計依頼書",
      table: "design_requests",
    });
  });

  it("法人コードの無い番号・旧番号は docKey なしで返す（呼び出し側が DB で引く）", () => {
    expect(resolvePreviewTarget("/sales/quotes/QOT-2026-00002")).toEqual({
      kind: "quote",
      permissionCode: "quote",
      label: "見積書",
      table: "quotes",
      docNumber: "QOT-2026-00002",
      docKey: null,
      rawId: "QOT-2026-00002",
    });
    // 番号設計 PR-C より前に貼られたリンク
    expect(resolvePreviewTarget("/sales/quotes/QOT-202607-00002")).toEqual({
      kind: "quote",
      permissionCode: "quote",
      label: "見積書",
      table: "quotes",
      docNumber: "QOT-202607-00002",
      docKey: null,
      rawId: "QOT-202607-00002",
    });
    // 法人コード付きの旧番号も、鍵にはならない（新しい番号を引く必要がある）
    expect(
      resolvePreviewTarget("/sales/quotes/CKK~QOT-202607-00002"),
    ).toMatchObject({ docNumber: "QOT-202607-00002", docKey: null });
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
      resolvePreviewTarget("/sales/price-lists/CKK~EST-2026-00001"),
    ).toBeNull();
    expect(
      resolvePreviewTarget("/sales/price-lists/EST-202607-00001"),
    ).toBeNull();
    expect(resolvePreviewTarget("/sales/price-lists")).toBeNull();
    expect(
      resolvePreviewTarget("/sales/price-lists/CKK~PRC-2026-00004/edit"),
    ).toBeNull();
    expect(resolvePreviewTarget("/sales/quotes/new")).toBeNull();
    expect(resolvePreviewTarget("/master/products/abc")).toBeNull();
    expect(resolvePreviewTarget("/master/products/0")).toBeNull();
    expect(resolvePreviewTarget("not a url")).toBeNull();
    expect(resolvePreviewTarget("/settings")).toBeNull();
  });

  it("URL-encoded ids are decoded before parsing", () => {
    const plain = resolvePreviewTarget("/sales/quotes/CKK~QOT-2026-00002");
    const encoded = resolvePreviewTarget(
      "/sales/quotes/CKK%7EQOT%2D2026%2D00002",
    );
    expect(encoded).toEqual(plain);
    expect(plain?.kind).toBe("quote");
  });
});

describe("genericPreviewTitle", () => {
  it("never includes business data — only 文書種別 + 番号 / id", () => {
    const doc = resolvePreviewTarget("/sales/quotes/CKK~QOT-2026-00002");
    const master = resolvePreviewTarget("/master/products/42");
    // 法人コードは出さない（番号だけ）
    expect(doc && genericPreviewTitle(doc)).toBe("見積書 QOT-2026-00002");
    expect(master && genericPreviewTitle(master)).toBe("製品 #42");
  });
});
