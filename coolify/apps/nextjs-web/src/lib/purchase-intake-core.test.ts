import { describe, expect, it } from "vitest";
import {
  MAX_PURCHASE_ITEMS,
  normalizeMaterialDelivery,
  normalizeMaterialOrder,
} from "./purchase-intake-core";

/**
 * 購買側の抽出結果の正規化。**読めなかったものを黙って埋めない**ことと、
 * 明細でない行（罫線・合計行の読み違い）を持ち込まないことを見る。
 */

const item = (over: Record<string, unknown> = {}) => ({
  material_name: "超硬丸棒 φ8.3×330",
  material_code: "B01A0001-A083-330",
  quantity: 10,
  unit: "本",
  unit_price: 4500,
  ...over,
});

describe("normalizeMaterialOrder", () => {
  it("読めた欄をそのまま写す", () => {
    const out = normalizeMaterialOrder({
      supplier_name: "冨士ダイス株式会社",
      supplier_contact: "山田",
      document_number: "MI-2026-0012",
      po_number: "PO-202609-00003",
      order_date: "2026/09/01",
      valid_until: "2026-10-31",
      currency: "jpy",
      items: [item({ maker: "AFC", grade: "K10UF", diameter_mm: 8.3 })],
      subtotal: 45000,
      tax_amount: 4500,
      total_amount: 49500,
      notes: "送料込み",
    });
    expect(out.supplierName).toBe("冨士ダイス株式会社");
    expect(out.documentNumber).toBe("MI-2026-0012");
    expect(out.orderDate).toBe("2026-09-01");
    expect(out.validUntil).toBe("2026-10-31");
    expect(out.currency).toBe("JPY");
    expect(out.totalAmount).toBe(49500);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({
      materialText: "超硬丸棒 φ8.3×330",
      materialCode: "B01A0001-A083-330",
      maker: "AFC",
      grade: "K10UF",
      diameterMm: 8.3,
      quantity: 10,
      unit: "本",
      unitPrice: 4500,
      lotNumber: null,
      notes: null,
    });
  });

  it("数量が読めない行は 1 にして備考に印を付ける", () => {
    const out = normalizeMaterialOrder({
      items: [item({ quantity: null }), item({ quantity: 0 })],
    });
    expect(out.items.map((i) => i.quantity)).toEqual([1, 1]);
    expect(out.items[0].notes).toBeTruthy();
    expect(out.items[1].notes).toContain("0");
  });

  it("**小数の数量はそのまま通す**（kg / m で買う素材がある）", () => {
    const out = normalizeMaterialOrder({
      items: [item({ quantity: 0.5, unit: "kg" })],
    });
    expect(out.items[0].quantity).toBe(0.5);
    expect(out.items[0].notes).toBeNull();
  });

  it("負の単価・負の金額は未入力にする（人が入れ直す）", () => {
    const out = normalizeMaterialOrder({
      items: [item({ unit_price: -1, amount: -5 })],
    });
    expect(out.items[0].unitPrice).toBeNull();
    expect(out.items[0].amount).toBeNull();
  });

  it("品名もコードも無い行は捨てる（罫線・合計行の読み違い）", () => {
    const out = normalizeMaterialOrder({
      items: [
        { material_name: "  ", material_code: null, quantity: 3 },
        item(),
        { quantity: 99 },
      ],
    });
    expect(out.items).toHaveLength(1);
  });

  it("明細は上限で打ち切る", () => {
    const out = normalizeMaterialOrder({
      items: Array.from({ length: MAX_PURCHASE_ITEMS + 25 }, () => item()),
    });
    expect(out.items).toHaveLength(MAX_PURCHASE_ITEMS);
  });

  it("読めない日付・寸法・通貨は null", () => {
    const out = normalizeMaterialOrder({
      order_date: "先月",
      valid_until: "",
      currency: "¥",
      items: [item({ diameter_mm: 0, length_mm: -3, expected_date: "??" })],
    });
    expect(out.orderDate).toBeNull();
    expect(out.validUntil).toBeNull();
    expect(out.currency).toBeNull();
    expect(out.items[0].diameterMm).toBeNull();
    expect(out.items[0].lengthMm).toBeNull();
    expect(out.items[0].expectedDate).toBeNull();
  });

  it("空・壊れた入力でも形は保つ", () => {
    for (const raw of [null, undefined, {}, { items: "x" }, 42]) {
      const out = normalizeMaterialOrder(raw);
      expect(out.items).toEqual([]);
      expect(out.supplierName).toBeNull();
    }
  });
});

describe("normalizeMaterialDelivery", () => {
  it("届いた数量とロット番号を読む（金額欄は持たない）", () => {
    const out = normalizeMaterialDelivery({
      supplier_name: "冨士ダイス株式会社",
      delivery_number: "N-00891",
      delivery_date: "2026.09.03",
      po_number: "PO-202609-00003",
      items: [
        item({ lot_number: "LOT-7788", unit_price: 4500, amount: 45000 }),
      ],
      notes: "分納 1/2",
    });
    expect(out.deliveryNumber).toBe("N-00891");
    expect(out.deliveryDate).toBe("2026-09-03");
    expect(out.poNumber).toBe("PO-202609-00003");
    expect(out.items[0].lotNumber).toBe("LOT-7788");
    // 納品書に金額が刷ってあっても入荷では使わない。
    expect(out.items[0].unitPrice).toBeNull();
    expect(out.items[0].amount).toBeNull();
    expect(out.items[0].expectedDate).toBeNull();
  });

  it("数量の扱いは発注書と同じ", () => {
    const out = normalizeMaterialDelivery({
      items: [item({ quantity: -2 }), item({ quantity: 2.5 })],
    });
    expect(out.items[0].quantity).toBe(1);
    expect(out.items[0].notes).toBeTruthy();
    expect(out.items[1].quantity).toBe(2.5);
  });

  it("空・壊れた入力でも形は保つ", () => {
    const out = normalizeMaterialDelivery(null);
    expect(out).toEqual({
      supplierName: null,
      deliveryNumber: null,
      deliveryDate: null,
      poNumber: null,
      items: [],
      notes: null,
    });
  });
});
